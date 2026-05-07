use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

// ── STATE ─────────────────────────────────────────────────────────────────────

struct SerialState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    write_port: Mutex<Option<Box<dyn serialport::SerialPort>>>,
}

struct TcpState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    write_stream: Mutex<Option<TcpStream>>,
}

fn recordings_dir() -> PathBuf {
    let home = dirs_next::document_dir()
        .or_else(dirs_next::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("uart_recordings")
}

// ── SERIAL PORT COMMANDS ──────────────────────────────────────────────────────

#[tauri::command]
fn list_serial_ports() -> Result<Vec<serde_json::Value>, String> {
    serialport::available_ports()
        .map(|ports| {
            ports
                .iter()
                .map(|p| {
                    serde_json::json!({
                        "path": p.port_name,
                        "port_type": format!("{:?}", p.port_type)
                    })
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn connect_serial(
    port_name: String,
    baud_rate: u32,
    state: tauri::State<'_, SerialState>,
    app: AppHandle,
) -> Result<(), String> {
    // Stop existing connection
    {
        let mut tx = state.stop_tx.lock().unwrap();
        if let Some(sender) = tx.take() {
            let _ = sender.send(());
        }
    }

    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| {
            let msg = if e.to_string().contains("Access denied") || e.to_string().contains(" Permission denied") {
                "Port kilitli (Başka bir program kullanıyor olabilir)".to_string()
            } else {
                e.to_string()
            };
            let _ = app.emit("serial-status", serde_json::json!({ "connected": false, "error": msg }));
            msg
        })?;

    let write_port = port.try_clone().map_err(|e| e.to_string())?;

    {
        let mut wp = state.write_port.lock().unwrap();
        *wp = Some(write_port);
    }

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    {
        let mut tx = state.stop_tx.lock().unwrap();
        *tx = Some(stop_tx);
    }

    let app_clone = app.clone();
    thread::spawn(move || {
        let mut port = port;
        let mut buf = vec![0u8; 256];
        let mut rx_buffer: Vec<u8> = Vec::new();

        app_clone
            .emit("serial-status", serde_json::json!({ "connected": true }))
            .ok();

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            match port.read(&mut buf) {
                Ok(n) if n > 0 => {
                    rx_buffer.extend_from_slice(&buf[..n]);

                    // Emit after small gap — collect bytes up to 50ms
                    thread::sleep(Duration::from_millis(10));
                    if let Ok(extra) = port.read(&mut buf) {
                        if extra > 0 {
                            rx_buffer.extend_from_slice(&buf[..extra]);
                        }
                    }

                    let hex = rx_buffer
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(" ");

                    app_clone
                        .emit("serial-data", serde_json::json!({ "hex": hex, "bytes": rx_buffer }))
                        .ok();

                    rx_buffer.clear();
                }
                Err(ref e)
                    if e.kind() == std::io::ErrorKind::TimedOut
                        || e.kind() == std::io::ErrorKind::WouldBlock =>
                {
                    // Normal timeout — keep looping
                }
                Err(e) => {
                    app_clone
                        .emit(
                            "serial-status",
                            serde_json::json!({ "connected": false, "error": e.to_string() }),
                        )
                        .ok();
                    break;
                }
                _ => {}
            }
        }

        app_clone
            .emit("serial-status", serde_json::json!({ "connected": false }))
            .ok();
    });

    Ok(())
}

#[tauri::command]
fn disconnect_serial(state: tauri::State<'_, SerialState>, app: AppHandle) -> Result<(), String> {
    let mut tx = state.stop_tx.lock().unwrap();
    if let Some(sender) = tx.take() {
        let _ = sender.send(());
    }
    let mut wp = state.write_port.lock().unwrap();
    *wp = None;
    app.emit("serial-status", serde_json::json!({ "connected": false }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_serial(bytes: Vec<u8>, state: tauri::State<'_, SerialState>) -> Result<(), String> {
    let mut wp = state.write_port.lock().unwrap();
    if let Some(port) = wp.as_mut() {
        port.write_all(&bytes).map_err(|e| e.to_string())
    } else {
        Err("Seri port bağlı değil".to_string())
    }
}

// ── TCP COMMANDS ──────────────────────────────────────────────────────────────

#[tauri::command]
fn connect_tcp(
    host: String,
    port: u16,
    state: tauri::State<'_, TcpState>,
    app: AppHandle,
) -> Result<(), String> {
    // Stop existing
    {
        let mut tx = state.stop_tx.lock().unwrap();
        if let Some(sender) = tx.take() {
            let _ = sender.send(());
        }
    }

    let addr = format!("{}:{}", host, port);
    let stream = TcpStream::connect(&addr).map_err(|e| {
        let msg = e.to_string();
        let _ = app.emit("tcp-status", serde_json::json!({ "connected": false, "error": msg }));
        e.to_string()
    })?;

    stream.set_read_timeout(Some(Duration::from_millis(100))).ok();

    let write_stream = stream.try_clone().map_err(|e| e.to_string())?;
    {
        let mut ws = state.write_stream.lock().unwrap();
        *ws = Some(write_stream);
    }

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    {
        let mut tx = state.stop_tx.lock().unwrap();
        *tx = Some(stop_tx);
    }

    let app_clone = app.clone();
    thread::spawn(move || {
        let mut stream = stream;
        let mut buf = vec![0u8; 1024];

        app_clone
            .emit("tcp-status", serde_json::json!({ "connected": true }))
            .ok();

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            match stream.read(&mut buf) {
                Ok(0) => {
                    // Connection closed
                    app_clone
                        .emit("tcp-status", serde_json::json!({ "connected": false }))
                        .ok();
                    break;
                }
                Ok(n) => {
                    let bytes = buf[..n].to_vec();
                    let hex = bytes
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(" ");
                    app_clone
                        .emit("tcp-data", serde_json::json!({ "hex": hex, "bytes": bytes }))
                        .ok();
                }
                Err(ref e)
                    if e.kind() == std::io::ErrorKind::TimedOut
                        || e.kind() == std::io::ErrorKind::WouldBlock =>
                {
                    // Normal timeout
                }
                Err(e) => {
                    app_clone
                        .emit(
                            "tcp-status",
                            serde_json::json!({ "connected": false, "error": e.to_string() }),
                        )
                        .ok();
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn disconnect_tcp(state: tauri::State<'_, TcpState>, app: AppHandle) -> Result<(), String> {
    let mut tx = state.stop_tx.lock().unwrap();
    if let Some(sender) = tx.take() {
        let _ = sender.send(());
    }
    let mut ws = state.write_stream.lock().unwrap();
    *ws = None;
    app.emit("tcp-status", serde_json::json!({ "connected": false }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_tcp(bytes: Vec<u8>, state: tauri::State<'_, TcpState>) -> Result<(), String> {
    let mut ws = state.write_stream.lock().unwrap();
    if let Some(stream) = ws.as_mut() {
        stream.write_all(&bytes).map_err(|e| e.to_string())
    } else {
        Err("TCP bağlı değil".to_string())
    }
}

// ── RECORDING FILE COMMANDS ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct RecordingMeta {
    id: String,
    name: String,
    #[serde(rename = "createdAt")]
    created_at: u64,
    #[serde(rename = "frameCount")]
    frame_count: usize,
    #[serde(rename = "durationMs")]
    duration_ms: f64,
}

#[tauri::command]
fn list_recordings() -> Result<Vec<RecordingMeta>, String> {
    let dir = recordings_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut metas = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let id = path.file_name().unwrap().to_string_lossy().to_string();
        let name = path
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .to_string();

        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let created_at = meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let content_str = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let frames: Vec<serde_json::Value> =
            serde_json::from_str(&content_str).unwrap_or_default();
        let frame_count = frames.len();
        let duration_ms = frames
            .last()
            .and_then(|f| f.get("time"))
            .and_then(|t| t.as_f64())
            .unwrap_or(0.0);

        metas.push(RecordingMeta {
            id,
            name,
            created_at,
            frame_count,
            duration_ms,
        });
    }

    Ok(metas)
}

#[tauri::command]
fn save_recording(name: String, data: serde_json::Value) -> Result<(), String> {
    let dir = recordings_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let safe_name = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect::<String>();
    let file_name = format!("{}.json", safe_name);
    let path = dir.join(&file_name);

    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_recording(id: String) -> Result<serde_json::Value, String> {
    let path = recordings_dir().join(&id);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_recording(id: String) -> Result<(), String> {
    let path = recordings_dir().join(&id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
        Err(format!("Kayıt bulunamadı: {}", id))
    }
}

// ── APP ENTRY ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SerialState {
            stop_tx: Mutex::new(None),
            write_port: Mutex::new(None),
        })
        .manage(TcpState {
            stop_tx: Mutex::new(None),
            write_stream: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_serial,
            disconnect_serial,
            write_serial,
            connect_tcp,
            disconnect_tcp,
            write_tcp,
            list_recordings,
            save_recording,
            load_recording,
            delete_recording,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılamadı");
}
