use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::net::tcp::OwnedWriteHalf;
use tokio::sync::{broadcast, Mutex};
use serde::{Serialize, Deserialize};
use rand::Rng;
use serde_json::json;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BitTransition {
    t: u64,
    v: u8,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ParsedField {
    name: String,
    decimal: f64,
    width: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Frame {
    u_id: String,
    frame_number: u64,
    timestamp_ms: u64,
    raw_hex: String,
    raw_bytes: Vec<u8>,
    fields: Vec<ParsedField>,
    bit_stream: Option<Vec<BitTransition>>,
    errors: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TickPayload {
    #[serde(rename = "type")]
    msg_type: String,
    frame: Frame,
    status: String,
    elapsed_ms: u64,
    selected_profile_id: Option<String>,
}

struct AppState {
    writer: Arc<Mutex<Option<OwnedWriteHalf>>>,
    serial_port: Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>,
    stop_tx: broadcast::Sender<()>,
    is_paused: Arc<AtomicBool>,
}

fn gaussian(x: f64, pos: f64, width: f64, amp: f64) -> f64 {
    amp * (-(x - pos).powi(2) / (2.0 * width.powi(2))).exp()
}

#[tauri::command]
async fn connect_tcp(
    host: String,
    port: u16,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let stream = TcpStream::connect(format!("{}:{}", host, port))
        .await
        .map_err(|e| e.to_string())?;

    let (mut reader, writer_half) = stream.into_split();
    
    let mut writer = state.writer.lock().await;
    *writer = Some(writer_half);

    tokio::spawn(async move {
        let mut buffer = [0u8; 1024];
        while let Ok(n) = reader.read(&mut buffer).await {
            if n == 0 { break; }
            let _ = window.emit("tcp-data", buffer[..n].to_vec());
        }
        let _ = window.emit("tcp-disconnected", ());
    });

    Ok(())
}

#[tauri::command] async fn update_peripherals() -> Result<(), String> { Ok(()) }

#[tauri::command]
async fn start_simulation(window: tauri::Window, state: State<'_, AppState>) -> Result<(), String> {
    let mut stop_rx = state.stop_tx.subscribe();
    let start_time = std::time::Instant::now();

    println!("[RUST] Simülasyon başlatılıyor (Chaos Mod)...");

    let stop_tx = state.stop_tx.clone();
    let is_paused = state.is_paused.clone();
    let serial_port = state.serial_port.clone();
    let mut stop_rx = stop_tx.subscribe();
    
    tokio::spawn(async move {
        let mut frame_count: u64 = 0;
        let mut interval = tokio::time::interval(Duration::from_millis(40)); // 25 FPS (more stable)
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if is_paused.load(Ordering::Relaxed) {
                        continue;
                    }
                    
                    let (frame, elapsed) = {
                        let mut rng = rand::thread_rng();
                        let frame_num = frame_count + 1;
                        frame_count = frame_num;
                        let elapsed_ms = start_time.elapsed().as_millis() as u64;

                        // Simulated Logic Analyzer data (UART-like transitions)
                        let mut bit_transitions: Vec<BitTransition> = Vec::new();
                        let mut current_t = elapsed_ms;
                        for _ in 0..10 {
                            bit_transitions.push(BitTransition { t: current_t, v: rng.gen_range(0..2) });
                            current_t += 1;
                        }
                        let t_ms = elapsed_ms as f64;
                        
                        // RANDOMIZED CHAOS DATA
                        let noise: f64 = rng.gen_range(-15.0..15.0);
                        
                        // Base Wave (ECG-ish)
                        let period = 800.0;
                        let t = (t_ms % period) / period;
                        let ecg_base = gaussian(t, 0.3, 0.01, 1.0) + gaussian(t, 0.1, 0.05, 0.2);
                        let ecg_val = ecg_base * 400.0 + 400.0 + noise;

                        // SPO2 Wave
                        let spo2_base = (t_ms * 0.01).sin() * 150.0 + 500.0;
                        let spo2_val = spo2_base + rng.gen_range(-10.0..10.0);

                        // Stats
                        let bpm = 75.0 + rng.gen_range(-2.0..2.0);
                        let spo2_stat = 98.0 + rng.gen_range(-1.0..1.0);
                        let rr = 16.0 + rng.gen_range(-1.0..1.0);
                        let temp = 36.6 + rng.gen_range(-0.2..0.2);

                        let mut fields = Vec::new();
                        let mut add_field = |name: &str, val: f64, width: usize| {
                            fields.push(ParsedField {
                                name: name.to_string(),
                                decimal: val,
                                width: width,
                            });
                        };

                        add_field("Lead-I", ecg_val, 2);
                        add_field("Lead-II", ecg_val * 0.9, 2);
                        add_field("SpO2-Wave", spo2_val, 2);
                        add_field("BPM", bpm, 1);
                        add_field("SpO2", spo2_stat, 1);
                        add_field("RR", rr, 1);
                        add_field("Temp", temp, 1);
                        add_field("Alarms", 0.0, 1);

                        let mut raw_bytes = Vec::new();
                        for field in &fields {
                            let val = field.decimal as u64;
                            if field.width == 1 {
                                raw_bytes.push(val as u8);
                            } else if field.width == 2 {
                                raw_bytes.extend_from_slice(&(val as u16).to_be_bytes());
                            } else if field.width == 4 {
                                raw_bytes.extend_from_slice(&(val as u32).to_be_bytes());
                            }
                        }
                        let raw_hex = raw_bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");

                        let frame = Frame {
                            u_id: format!("{}-{}", frame_num, start_time.elapsed().as_micros()),
                            frame_number: frame_num,
                            timestamp_ms: elapsed_ms,
                            raw_hex,
                            raw_bytes,
                            fields,
                            bit_stream: Some(bit_transitions),
                            errors: Vec::new(),
                        };
                        (frame, elapsed_ms)
                    };

                    // Write to Serial if connected
                    {
                        let mut serial_lock = serial_port.lock().await;
                        if let Some(ref mut p) = *serial_lock {
                            if let Err(e) = p.write_all(&frame.raw_bytes) {
                                println!("[SERIAL] Write error: {}", e);
                            } else {
                                // Optional: println!("[SERIAL] Wrote {} bytes", frame.raw_bytes.len());
                            }
                        }
                    }

                    let _ = window.emit("TICK", json!({
                        "type": "TICK",
                        "frame": frame,
                        "status": "running",
                        "elapsedMs": elapsed
                    }));

                    if frame.frame_number % 5 == 0 {
                        let _ = window.emit("CONVERSATION", json!({
                            "type": "CONVERSATION",
                            "entry": {
                                "id": format!("tx-{}", frame.frame_number),
                                "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64,
                                "type": "tx",
                                "rawHex": frame.raw_hex.clone(),
                                "details": "Simulated TX"
                            }
                        }));
                    }
                }
                _ = stop_rx.recv() => {
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_simulation(state: State<'_, AppState>) -> Result<(), String> {
    let _ = state.stop_tx.send(());
    Ok(())
}

#[tauri::command]
async fn pause_simulation(state: State<'_, AppState>) -> Result<(), String> {
    state.is_paused.store(true, Ordering::Relaxed);
    println!("[RUST] Simülasyon duraklatıldı.");
    Ok(())
}

#[tauri::command]
async fn resume_simulation(state: State<'_, AppState>) -> Result<(), String> {
    state.is_paused.store(false, Ordering::Relaxed);
    println!("[RUST] Simülasyon devam ediyor.");
    Ok(())
}
#[tauri::command] async fn override_field() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn override_bit() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn inject_error() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn reset_overrides() -> Result<(), String> { Ok(()) }
#[tauri::command]
async fn connect_serial(
    port_name: String,
    baud_rate: u32,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("[SERIAL] Connecting to {} at {} baud", port_name, baud_rate);
    
    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(10))
        .open()
        .map_err(|e| e.to_string())?;
    
    let mut reader = port.try_clone().map_err(|e| e.to_string())?;
    
    {
        let mut serial_lock = state.serial_port.lock().await;
        *serial_lock = Some(port);
    }
    
    // Start a reading thread for RX (using the cloned reader)
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        println!("[SERIAL] Reader thread started.");
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    println!("[SERIAL] Read {} bytes", n);
                    let hex = buffer[..n].iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                    let _ = window_clone.emit("RAW_RX_DATA", json!({ "hex": hex }));
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Normal timeout, continue
                }
                Err(e) => {
                    println!("[SERIAL] Read error: {}", e);
                    break;
                }
            }
            // Small sleep to avoid CPU spinning if read is non-blocking (though we set a timeout)
            std::thread::sleep(Duration::from_millis(1));
        }
        println!("[SERIAL] Reader thread stopped.");
    });

    Ok(())
}

#[tauri::command]
async fn disconnect_serial(state: State<'_, AppState>) -> Result<(), String> {
    let mut serial_lock = state.serial_port.lock().await;
    *serial_lock = None;
    println!("[SERIAL] Disconnected.");
    Ok(())
}
#[tauri::command] async fn send_tcp(data: Vec<u8>, state: State<'_, AppState>) -> Result<(), String> {
    let mut writer_lock = state.writer.lock().await;
    if let Some(writer) = writer_lock.as_mut() {
        writer.write_all(&data).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Not connected".into())
    }
}
#[tauri::command] async fn disconnect_tcp(state: State<'_, AppState>) -> Result<(), String> {
    let mut writer = state.writer.lock().await;
    *writer = None;
    Ok(())
}

#[tauri::command] async fn begin_record() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn end_record() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn save_recording() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn delete_recording() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn list_recordings() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn start_playback() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn pause_playback() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn resume_playback() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn seek_playback() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn step_playback() -> Result<(), String> { Ok(()) }
#[derive(Serialize)]
struct PortInfo {
    path: String,
}

#[tauri::command]
async fn get_ports() -> Result<Vec<PortInfo>, String> {
    match serialport::available_ports() {
        Ok(ports) => {
            println!("[RUST] Found {} serial ports", ports.len());
            Ok(ports.into_iter().map(|p| PortInfo { path: p.port_name }).collect())
        },
        Err(e) => {
            println!("[RUST] Error finding serial ports: {}", e);
            Err(e.to_string())
        },
    }
}
#[tauri::command] async fn update_responder_rules() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn set_signal_integrity() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn set_triggers() -> Result<(), String> { Ok(()) }
#[tauri::command] async fn set_custom_waveform() -> Result<(), String> { Ok(()) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (stop_tx, _) = broadcast::channel(1);

    tauri::Builder::default()
        .manage(AppState {
            writer: Arc::new(Mutex::new(None)),
            serial_port: Arc::new(Mutex::new(None)),
            stop_tx,
            is_paused: Arc::new(AtomicBool::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            connect_tcp, send_tcp, disconnect_tcp,
            update_peripherals, start_simulation, stop_simulation, pause_simulation, resume_simulation,
            override_field, override_bit, inject_error, reset_overrides,
            connect_serial, disconnect_serial, get_ports,
            begin_record, end_record, save_recording, delete_recording, list_recordings,
            start_playback, pause_playback, resume_playback, seek_playback, step_playback,
            update_responder_rules, set_signal_integrity, set_triggers, set_custom_waveform
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
