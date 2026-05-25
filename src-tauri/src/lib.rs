use serde::{Deserialize, Serialize};
use std::ffi::CString;
use std::io::{Read, Write};
use std::net::TcpStream;
#[cfg(target_os = "linux")]
use std::os::fd::RawFd;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ── STATE ─────────────────────────────────────────────────────────────────────

struct SerialState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    write_port: Mutex<Option<Box<dyn serialport::SerialPort>>>,
}

struct TcpState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    write_stream: Mutex<Option<TcpStream>>,
}

struct TcpServerState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    active_stream: Arc<Mutex<Option<TcpStream>>>,
}

struct SocketCanState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    #[cfg(target_os = "linux")]
    write_fd: Mutex<Option<RawFd>>,
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
                "ERR_PORT_LOCKED".to_string()
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
        Err("ERR_SERIAL_NOT_CONNECTED".to_string())
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
        Err("ERR_TCP_NOT_CONNECTED".to_string())
    }
}

// ── TCP SERVER COMMANDS (VIRTUAL COM BRIDGE) ──────────────────────────────────

#[tauri::command]
fn start_tcp_server(
    port: u16,
    state: tauri::State<'_, TcpServerState>,
    app: AppHandle,
) -> Result<(), String> {
    // Mevcut sunucuyu durdur
    {
        let mut tx = state.stop_tx.lock().unwrap();
        if let Some(sender) = tx.take() {
            let _ = sender.send(());
        }
    }

    let listener = std::net::TcpListener::bind(format!("0.0.0.0:{}", port)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    {
        let mut tx = state.stop_tx.lock().unwrap();
        *tx = Some(stop_tx);
    }

    let active_stream_arc = state.active_stream.clone();
    let app_clone = app.clone();

    app_clone.emit("tcp-server-status", serde_json::json!({ "status": "listening", "port": port })).ok();

    thread::spawn(move || {
        let mut buf = vec![0u8; 1024];
        loop {
            if stop_rx.try_recv().is_ok() {
                let mut ws = active_stream_arc.lock().unwrap();
                *ws = None;
                break;
            }

            // Yeni bağlantı bekle (eğer mevcut yoksa)
            match listener.accept() {
                Ok((stream, addr)) => {
                    stream.set_nonblocking(true).ok();
                    let mut ws = active_stream_arc.lock().unwrap();
                    *ws = Some(stream.try_clone().unwrap()); 
                    app_clone.emit("tcp-server-status", serde_json::json!({ "status": "connected", "client": addr.to_string() })).ok();
                }
                Err(_) => {}
            }

            // Aktif bağlantıdan veri oku
            let mut disconnected = false;
            {
                let mut ws = active_stream_arc.lock().unwrap();
                if let Some(stream) = ws.as_mut() {
                    match stream.read(&mut buf) {
                        Ok(0) => {
                            disconnected = true; // İstemci koptu
                        }
                        Ok(n) => {
                            let bytes = buf[..n].to_vec();
                            let hex = bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                            app_clone.emit("tcp-server-data", serde_json::json!({ "hex": hex, "bytes": bytes })).ok();
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                        Err(_) => {
                            disconnected = true;
                        }
                    }
                }
            }

            if disconnected {
                let mut ws = active_stream_arc.lock().unwrap();
                *ws = None;
                app_clone.emit("tcp-server-status", serde_json::json!({ "status": "listening", "port": port })).ok();
            }

            thread::sleep(Duration::from_millis(20));
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_tcp_server(state: tauri::State<'_, TcpServerState>, app: AppHandle) -> Result<(), String> {
    let mut tx = state.stop_tx.lock().unwrap();
    if let Some(sender) = tx.take() {
        let _ = sender.send(());
    }
    let mut ws = state.active_stream.lock().unwrap();
    *ws = None;
    app.emit("tcp-server-status", serde_json::json!({ "status": "stopped" })).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_tcp_server(bytes: Vec<u8>, state: tauri::State<'_, TcpServerState>) -> Result<(), String> {
    let mut ws = state.active_stream.lock().unwrap();
    if let Some(stream) = ws.as_mut() {
        stream.write_all(&bytes).map_err(|e| e.to_string())
    } else {
        Err("ERR_NO_CONNECTED_CLIENT".to_string())
    }
}

// ── SOCKETCAN COMMANDS ────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
const CAN_EFF_FLAG: u32 = 0x8000_0000;
#[cfg(target_os = "linux")]
const CAN_RTR_FLAG: u32 = 0x4000_0000;
#[cfg(target_os = "linux")]
const CAN_EFF_MASK: u32 = 0x1FFF_FFFF;
#[cfg(target_os = "linux")]
const CAN_SFF_MASK: u32 = 0x0000_07FF;

#[cfg(target_os = "linux")]
#[repr(C)]
#[derive(Clone, Copy)]
struct LinuxCanFrame {
    can_id: u32,
    can_dlc: u8,
    __pad: u8,
    __res0: u8,
    len8_dlc: u8,
    data: [u8; 8],
}

#[cfg(target_os = "linux")]
#[repr(C)]
struct SockAddrCan {
    can_family: libc::sa_family_t,
    can_ifindex: libc::c_int,
    addr: [u8; 8],
}

#[cfg(target_os = "linux")]
fn open_socketcan_fd(interface: &str) -> Result<RawFd, String> {
    let if_name = CString::new(interface).map_err(|_| "ERR_INVALID_SOCKETCAN_INTERFACE".to_string())?;
    let if_index = unsafe { libc::if_nametoindex(if_name.as_ptr()) };
    if if_index == 0 {
        return Err(format!("ERR_SOCKETCAN_INTERFACE_NOT_FOUND:{}", interface));
    }

    let fd = unsafe { libc::socket(libc::AF_CAN, libc::SOCK_RAW, libc::CAN_RAW) };
    if fd < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }

    let addr = SockAddrCan {
        can_family: libc::AF_CAN as libc::sa_family_t,
        can_ifindex: if_index as libc::c_int,
        addr: [0; 8],
    };
    let bind_result = unsafe {
        libc::bind(
            fd,
            &addr as *const SockAddrCan as *const libc::sockaddr,
            std::mem::size_of::<SockAddrCan>() as libc::socklen_t,
        )
    };
    if bind_result < 0 {
        let err = std::io::Error::last_os_error().to_string();
        unsafe { libc::close(fd) };
        return Err(err);
    }

    Ok(fd)
}

#[cfg(target_os = "linux")]
fn decode_linux_can_frame(frame: LinuxCanFrame) -> serde_json::Value {
    let is_extended = (frame.can_id & CAN_EFF_FLAG) != 0;
    let is_rtr = (frame.can_id & CAN_RTR_FLAG) != 0;
    let arbitration_id = if is_extended {
        frame.can_id & CAN_EFF_MASK
    } else {
        frame.can_id & CAN_SFF_MASK
    };
    let dlc = frame.can_dlc.min(8);
    let data = frame.data[..dlc as usize].to_vec();

    serde_json::json!({
        "arbitrationId": arbitration_id,
        "idFormat": if is_extended { "extended" } else { "standard" },
        "isRTR": is_rtr,
        "dlc": dlc,
        "data": data,
    })
}

#[cfg(target_os = "linux")]
fn build_linux_can_frame(
    arbitration_id: u32,
    data: Vec<u8>,
    is_extended: bool,
    is_rtr: bool,
) -> LinuxCanFrame {
    let dlc = data.len().min(8);
    let mut can_id = if is_extended {
        (arbitration_id & CAN_EFF_MASK) | CAN_EFF_FLAG
    } else {
        arbitration_id & CAN_SFF_MASK
    };
    if is_rtr {
        can_id |= CAN_RTR_FLAG;
    }

    let mut frame = LinuxCanFrame {
        can_id,
        can_dlc: dlc as u8,
        __pad: 0,
        __res0: 0,
        len8_dlc: 0,
        data: [0; 8],
    };
    frame.data[..dlc].copy_from_slice(&data[..dlc]);
    frame
}

#[cfg(target_os = "linux")]
fn write_socketcan_fd(
    fd: RawFd,
    arbitration_id: u32,
    data: Vec<u8>,
    is_extended: bool,
    is_rtr: bool,
) -> Result<(), String> {
    let frame = build_linux_can_frame(arbitration_id, data, is_extended, is_rtr);
    let written = unsafe {
        libc::write(
            fd,
            &frame as *const LinuxCanFrame as *const libc::c_void,
            std::mem::size_of::<LinuxCanFrame>(),
        )
    };
    if written < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn connect_socketcan(
    interface: String,
    state: tauri::State<'_, SocketCanState>,
    app: AppHandle,
) -> Result<(), String> {
    {
        let mut tx = state.stop_tx.lock().unwrap();
        if let Some(sender) = tx.take() {
            let _ = sender.send(());
        }
    }

    let read_fd = open_socketcan_fd(&interface).map_err(|e| {
        let _ = app.emit("socketcan-status", serde_json::json!({ "connected": false, "error": e }));
        e
    })?;
    unsafe {
        let flags = libc::fcntl(read_fd, libc::F_GETFL, 0);
        if flags >= 0 {
            libc::fcntl(read_fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
        }
    }
    let write_fd = open_socketcan_fd(&interface).map_err(|e| {
        unsafe { libc::close(read_fd) };
        let _ = app.emit("socketcan-status", serde_json::json!({ "connected": false, "error": e }));
        e
    })?;

    {
        let mut fd = state.write_fd.lock().unwrap();
        *fd = Some(write_fd);
    }

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    {
        let mut tx = state.stop_tx.lock().unwrap();
        *tx = Some(stop_tx);
    }

    let app_clone = app.clone();
    thread::spawn(move || {
        app_clone
            .emit("socketcan-status", serde_json::json!({ "connected": true, "interface": interface }))
            .ok();

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            let mut frame = LinuxCanFrame {
                can_id: 0,
                can_dlc: 0,
                __pad: 0,
                __res0: 0,
                len8_dlc: 0,
                data: [0; 8],
            };
            let read_len = unsafe {
                libc::read(
                    read_fd,
                    &mut frame as *mut LinuxCanFrame as *mut libc::c_void,
                    std::mem::size_of::<LinuxCanFrame>(),
                )
            };
            if read_len == std::mem::size_of::<LinuxCanFrame>() as isize {
                app_clone.emit("socketcan-frame", decode_linux_can_frame(frame)).ok();
            } else if read_len < 0 {
                let err = std::io::Error::last_os_error();
                if err.kind() == std::io::ErrorKind::WouldBlock {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                }
                app_clone
                    .emit("socketcan-status", serde_json::json!({ "connected": false, "error": err.to_string() }))
                    .ok();
                break;
            }
        }

        unsafe { libc::close(read_fd) };
        app_clone
            .emit("socketcan-status", serde_json::json!({ "connected": false }))
            .ok();
    });

    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn connect_socketcan(_interface: String) -> Result<(), String> {
    Err("ERR_SOCKETCAN_LINUX_ONLY".to_string())
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn disconnect_socketcan(state: tauri::State<'_, SocketCanState>, app: AppHandle) -> Result<(), String> {
    let mut tx = state.stop_tx.lock().unwrap();
    if let Some(sender) = tx.take() {
        let _ = sender.send(());
    }
    let mut fd = state.write_fd.lock().unwrap();
    if let Some(write_fd) = fd.take() {
        unsafe { libc::close(write_fd) };
    }
    app.emit("socketcan-status", serde_json::json!({ "connected": false }))
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn disconnect_socketcan() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn write_socketcan_frame(
    arbitration_id: u32,
    data: Vec<u8>,
    is_extended: bool,
    is_rtr: bool,
    state: tauri::State<'_, SocketCanState>,
) -> Result<(), String> {
    let fd = state.write_fd.lock().unwrap();
    if let Some(write_fd) = *fd {
        write_socketcan_fd(write_fd, arbitration_id, data, is_extended, is_rtr)
    } else {
        Err("ERR_SOCKETCAN_NOT_CONNECTED".to_string())
    }
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn write_socketcan_frame(
    _arbitration_id: u32,
    _data: Vec<u8>,
    _is_extended: bool,
    _is_rtr: bool,
) -> Result<(), String> {
    Err("ERR_SOCKETCAN_LINUX_ONLY".to_string())
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
        Err(format!("ERR_RECORDING_NOT_FOUND:{}", id))
    }
}

// ── APP ENTRY ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
        .manage(TcpServerState {
            stop_tx: Mutex::new(None),
            active_stream: Arc::new(Mutex::new(None)),
        })
        .manage(SocketCanState {
            stop_tx: Mutex::new(None),
            #[cfg(target_os = "linux")]
            write_fd: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_serial,
            disconnect_serial,
            write_serial,
            connect_tcp,
            disconnect_tcp,
            write_tcp,
            start_tcp_server,
            stop_tcp_server,
            write_tcp_server,
            connect_socketcan,
            disconnect_socketcan,
            write_socketcan_frame,
            list_recordings,
            save_recording,
            load_recording,
            delete_recording,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılamadı");
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn socketcan_standard_frame_round_trips_to_json() {
        let frame = build_linux_can_frame(0x123, vec![0x11, 0x22, 0x33], false, false);

        assert_eq!(frame.can_id, 0x123);
        assert_eq!(frame.can_dlc, 3);
        assert_eq!(&frame.data[..3], &[0x11, 0x22, 0x33]);

        let decoded = decode_linux_can_frame(frame);
        assert_eq!(decoded["arbitrationId"], 0x123);
        assert_eq!(decoded["idFormat"], "standard");
        assert_eq!(decoded["isRTR"], false);
        assert_eq!(decoded["dlc"], 3);
        assert_eq!(decoded["data"], serde_json::json!([0x11, 0x22, 0x33]));
    }

    #[test]
    fn socketcan_extended_rtr_frame_sets_flags_and_masks_id() {
        let frame = build_linux_can_frame(0x3FFF_FFFF, vec![0xAA], true, true);

        assert_ne!(frame.can_id & CAN_EFF_FLAG, 0);
        assert_ne!(frame.can_id & CAN_RTR_FLAG, 0);

        let decoded = decode_linux_can_frame(frame);
        assert_eq!(decoded["arbitrationId"], CAN_EFF_MASK);
        assert_eq!(decoded["idFormat"], "extended");
        assert_eq!(decoded["isRTR"], true);
    }

    #[test]
    fn socketcan_frame_truncates_payload_to_classic_can_dlc() {
        let frame = build_linux_can_frame(0x7FF, vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false, false);

        assert_eq!(frame.can_dlc, 8);
        assert_eq!(frame.data, [1, 2, 3, 4, 5, 6, 7, 8]);

        let decoded = decode_linux_can_frame(frame);
        assert_eq!(decoded["dlc"], 8);
        assert_eq!(decoded["data"], serde_json::json!([1, 2, 3, 4, 5, 6, 7, 8]));
    }
}
