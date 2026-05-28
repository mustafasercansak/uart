use serde::{Deserialize, Serialize};
use std::ffi::CString;
use std::io::{Read, Write};
use std::net::TcpStream;
#[cfg(target_os = "linux")]
use std::os::fd::RawFd;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

// ── HELPERS ───────────────────────────────────────────────────────────────────

/// Returns the current wall-clock time in milliseconds.
/// On Linux uses CLOCK_REALTIME at nanosecond precision;
/// independent of the OS scheduler granularity.
fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}

/// Waits up to `timeout_ms` milliseconds for `fd` to become readable.
/// Returns > 0 when data is ready, 0 on timeout, < 0 on error.
#[cfg(target_os = "linux")]
fn poll_readable(fd: RawFd, timeout_ms: i32) -> i32 {
    let mut pfd = libc::pollfd {
        fd,
        events: libc::POLLIN,
        revents: 0,
    };
    unsafe { libc::poll(&mut pfd, 1, timeout_ms) }
}

/// Reads a single CAN frame via `recvmsg`.
/// If SO_TIMESTAMP is enabled on the socket, extracts a µs-precision kernel timestamp;
/// otherwise falls back to a userspace `now_ms()` timestamp.
#[cfg(target_os = "linux")]
fn recv_can_frame(fd: RawFd) -> Result<(LinuxCanFrame, f64), std::io::Error> {
    let mut frame: LinuxCanFrame = unsafe { std::mem::zeroed() };
    let mut iov = libc::iovec {
        iov_base: &mut frame as *mut LinuxCanFrame as *mut libc::c_void,
        iov_len: std::mem::size_of::<LinuxCanFrame>(),
    };
    // 128 bytes: more than enough for a single timeval cmsg.
    let mut ctrl_buf = [0u8; 128];
    let mut msg: libc::msghdr = unsafe { std::mem::zeroed() };
    msg.msg_iov = &mut iov;
    msg.msg_iovlen = 1;
    msg.msg_control = ctrl_buf.as_mut_ptr() as *mut libc::c_void;
    msg.msg_controllen = ctrl_buf.len() as _;

    let n = unsafe { libc::recvmsg(fd, &mut msg, 0) };
    if n < 0 {
        return Err(std::io::Error::last_os_error());
    }
    if n as usize != std::mem::size_of::<LinuxCanFrame>() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "unexpected frame size",
        ));
    }

    // Parse SO_TIMESTAMP from ancillary control messages.
    let mut ts_ms = now_ms();
    let mut cmsg = unsafe { libc::CMSG_FIRSTHDR(&msg) };
    while !cmsg.is_null() {
        let h = unsafe { &*cmsg };
        if h.cmsg_level == libc::SOL_SOCKET && h.cmsg_type == libc::SO_TIMESTAMP {
            let tv = unsafe {
                std::ptr::read_unaligned(libc::CMSG_DATA(cmsg) as *const libc::timeval)
            };
            ts_ms = (tv.tv_sec as f64) * 1000.0 + (tv.tv_usec as f64) / 1000.0;
            break;
        }
        cmsg = unsafe { libc::CMSG_NXTHDR(&msg, cmsg) };
    }

    Ok((frame, ts_ms))
}

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
    /// Used for writes only; reads are performed via a thread-local read_stream.
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

fn can_profiles_dir() -> PathBuf {
    let home = dirs_next::document_dir()
        .or_else(dirs_next::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("uart_profiles")
}

// ── CAN PROFILES PERSISTENCE ──────────────────────────────────────────────────

/// Load all CAN profiles from disk. Returns `null` (None) when no file exists yet,
/// so the frontend can detect a first-run and migrate from localStorage.
#[tauri::command]
fn load_can_profiles() -> Result<Option<serde_json::Value>, String> {
    let path = can_profiles_dir().join("profiles.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

/// Persist all CAN profiles to disk as a single JSON file.
#[tauri::command]
fn save_can_profiles(data: serde_json::Value) -> Result<(), String> {
    let dir = can_profiles_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("profiles.json");
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
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
            let msg = if e.to_string().contains("Access denied")
                || e.to_string().contains("Permission denied")
            {
                "ERR_PORT_LOCKED".to_string()
            } else {
                e.to_string()
            };
            let _ = app.emit(
                "serial-status",
                serde_json::json!({ "connected": false, "error": msg }),
            );
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

                    // Port timeout(100ms) already accumulates extra bytes; no additional sleep needed.
                    let hex = rx_buffer
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(" ");

                    app_clone
                        .emit(
                            "serial-data",
                            serde_json::json!({
                                "hex": hex,
                                "bytes": rx_buffer,
                                "timestamp": now_ms()
                            }),
                        )
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

    stream
        .set_read_timeout(Some(Duration::from_millis(100)))
        .ok();

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
                        .emit(
                            "tcp-data",
                            serde_json::json!({
                                "hex": hex,
                                "bytes": bytes,
                                "timestamp": now_ms()
                            }),
                        )
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
    // Stop any existing server
    {
        let mut tx = state.stop_tx.lock().unwrap();
        if let Some(sender) = tx.take() {
            let _ = sender.send(());
        }
    }

    let listener =
        std::net::TcpListener::bind(format!("0.0.0.0:{}", port)).map_err(|e| e.to_string())?;
    // Listener stays nonblocking; a 5 ms sleep prevents busy-waiting when no client is connected.
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    {
        let mut tx = state.stop_tx.lock().unwrap();
        *tx = Some(stop_tx);
    }

    let active_stream_arc = state.active_stream.clone();
    let app_clone = app.clone();

    app_clone
        .emit(
            "tcp-server-status",
            serde_json::json!({ "status": "listening", "port": port }),
        )
        .ok();

    thread::spawn(move || {
        let mut buf = vec![0u8; 1024];
        // The read stream is kept thread-local; writes go through active_stream_arc.
        // This avoids holding the mutex during a blocking read.
        let mut read_stream: Option<std::net::TcpStream> = None;

        loop {
            if stop_rx.try_recv().is_ok() {
                let mut ws = active_stream_arc.lock().unwrap();
                *ws = None;
                break;
            }

            // No active client — try to accept a new connection.
            if read_stream.is_none() {
                match listener.accept() {
                    Ok((stream, addr)) => {
                        // 100 ms read timeout: blocking but does not stall the loop.
                        stream
                            .set_read_timeout(Some(Duration::from_millis(100)))
                            .ok();
                        // Clone for writing: write_tcp_server accesses it through the mutex.
                        // Only mark the connection live when the write clone succeeds —
                        // if try_clone fails the frontend would believe it has a write path
                        // while active_stream_arc stays None, causing silent write failures.
                        if let Ok(write_clone) = stream.try_clone() {
                            let mut ws = active_stream_arc.lock().unwrap();
                            *ws = Some(write_clone);
                            drop(ws);
                            app_clone
                                .emit(
                                    "tcp-server-status",
                                    serde_json::json!({ "status": "connected", "client": addr.to_string() }),
                                )
                                .ok();
                            read_stream = Some(stream);
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // Waiting for a client — a short sleep is sufficient.
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(_) => {
                        // Persistent accept errors (e.g. EMFILE): back off to avoid busy-spin.
                        thread::sleep(Duration::from_millis(5));
                    }
                }
                continue;
            }

            // Read from the active client (100 ms blocking timeout; mutex is not held).
            let mut disconnected = false;
            if let Some(ref mut stream) = read_stream {
                match stream.read(&mut buf) {
                    Ok(0) => {
                        disconnected = true;
                    }
                    Ok(n) => {
                        let bytes = buf[..n].to_vec();
                        let hex = bytes
                            .iter()
                            .map(|b| format!("{:02X}", b))
                            .collect::<Vec<_>>()
                            .join(" ");
                        app_clone
                            .emit(
                                "tcp-server-data",
                                serde_json::json!({
                                    "hex": hex,
                                    "bytes": bytes,
                                    "timestamp": now_ms()
                                }),
                            )
                            .ok();
                    }
                    Err(ref e)
                        if e.kind() == std::io::ErrorKind::TimedOut
                            || e.kind() == std::io::ErrorKind::WouldBlock =>
                    {
                        // Timeout — loop back so stop_rx can be checked.
                    }
                    Err(_) => {
                        disconnected = true;
                    }
                }
            }

            if disconnected {
                read_stream = None;
                let mut ws = active_stream_arc.lock().unwrap();
                *ws = None;
                app_clone
                    .emit(
                        "tcp-server-status",
                        serde_json::json!({ "status": "listening", "port": port }),
                    )
                    .ok();
            }
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
    app.emit(
        "tcp-server-status",
        serde_json::json!({ "status": "stopped" }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_tcp_server(
    bytes: Vec<u8>,
    state: tauri::State<'_, TcpServerState>,
) -> Result<(), String> {
    // Clone the stream out of the mutex before writing so the lock is not held
    // during a potentially blocking write_all (prevents deadlock with the accept loop).
    let stream_clone = {
        let ws = state.active_stream.lock().unwrap();
        ws.as_ref().and_then(|s| s.try_clone().ok())
    };
    match stream_clone {
        Some(mut s) => s.write_all(&bytes).map_err(|e| e.to_string()),
        None => Err("ERR_NO_CONNECTED_CLIENT".to_string()),
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
    let if_name =
        CString::new(interface).map_err(|_| "ERR_INVALID_SOCKETCAN_INTERFACE".to_string())?;
    let if_index = unsafe { libc::if_nametoindex(if_name.as_ptr()) };
    if if_index == 0 {
        return Err(format!(
            "ERR_SOCKETCAN_INTERFACE_NOT_FOUND:{}",
            interface
        ));
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
    // Validate arbitration ID range.
    let id_limit = if is_extended { CAN_EFF_MASK } else { CAN_SFF_MASK };
    if arbitration_id > id_limit {
        return Err(format!(
            "ERR_CAN_ID_OUT_OF_RANGE: 0x{:X} exceeds {} limit 0x{:X}",
            arbitration_id,
            if is_extended { "extended" } else { "standard" },
            id_limit
        ));
    }
    // Classic CAN data frame is limited to 8 bytes.
    if data.len() > 8 {
        return Err(format!(
            "ERR_CAN_DLC_TOO_LARGE: {} bytes (max 8)",
            data.len()
        ));
    }
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
        let _ = app.emit(
            "socketcan-status",
            serde_json::json!({ "connected": false, "error": e }),
        );
        e
    })?;

    // SO_TIMESTAMP: request µs-precision hardware timestamps from the kernel.
    // O_NONBLOCK intentionally omitted — poll_readable() provides event-driven waiting.
    unsafe {
        let enable: libc::c_int = 1;
        libc::setsockopt(
            read_fd,
            libc::SOL_SOCKET,
            libc::SO_TIMESTAMP,
            &enable as *const libc::c_int as *const libc::c_void,
            std::mem::size_of::<libc::c_int>() as libc::socklen_t,
        );
    }

    let write_fd = open_socketcan_fd(&interface).map_err(|e| {
        unsafe { libc::close(read_fd) };
        let _ = app.emit(
            "socketcan-status",
            serde_json::json!({ "connected": false, "error": e }),
        );
        e
    })?;

    {
        let mut fd = state.write_fd.lock().unwrap();
        // Close the previous write_fd if present to avoid leaking file descriptors
        // when connect_socketcan is called again without disconnect_socketcan.
        if let Some(old_fd) = fd.take() {
            unsafe { libc::close(old_fd) };
        }
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
            .emit(
                "socketcan-status",
                serde_json::json!({ "connected": true, "interface": interface }),
            )
            .ok();

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            // Block up to 100 ms — no CPU spin; stop signals are detected promptly.
            let ready = poll_readable(read_fd, 100);
            if ready < 0 {
                let err = std::io::Error::last_os_error();
                if err.raw_os_error() == Some(libc::EINTR) {
                    continue; // interrupted by signal — retry
                }
                app_clone
                    .emit(
                        "socketcan-status",
                        serde_json::json!({ "connected": false, "error": err.to_string() }),
                    )
                    .ok();
                break;
            }
            if ready == 0 {
                continue; // poll timed out — check stop_rx
            }

            match recv_can_frame(read_fd) {
                Ok((frame, ts_ms)) => {
                    let mut decoded = decode_linux_can_frame(frame);
                    if let Some(map) = decoded.as_object_mut() {
                        map.insert("timestamp".to_string(), serde_json::json!(ts_ms));
                    }
                    app_clone.emit("socketcan-frame", decoded).ok();
                }
                Err(e) => {
                    app_clone
                        .emit(
                            "socketcan-status",
                            serde_json::json!({ "connected": false, "error": e.to_string() }),
                        )
                        .ok();
                    break;
                }
            }
        }

        unsafe { libc::close(read_fd) };
        // write_fd is closed by disconnect_socketcan (called by the frontend on receiving
        // this error event). Closing it here would race with a concurrent connect_socketcan.
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
fn disconnect_socketcan(
    state: tauri::State<'_, SocketCanState>,
    app: AppHandle,
) -> Result<(), String> {
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

#[derive(Serialize, Deserialize)]
struct RecordingMetaSidecar {
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

        // Process only primary recording files, not sidecar .meta.json files
        let ext = path.extension().and_then(|e| e.to_str());
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if ext != Some("json") || stem.ends_with(".meta") {
            continue;
        }

        let id = path.file_name().unwrap().to_string_lossy().to_string();
        let name = stem.to_string();

        let file_meta = entry.metadata().map_err(|e| e.to_string())?;
        let created_at = file_meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        // Read from lightweight sidecar if available; fall back to scanning the full file.
        let sidecar_path = path.with_extension("meta.json");
        let (frame_count, duration_ms) = if sidecar_path.exists() {
            let raw = std::fs::read_to_string(&sidecar_path).unwrap_or_default();
            let sc: RecordingMetaSidecar = serde_json::from_str(&raw).unwrap_or(RecordingMetaSidecar { frame_count: 0, duration_ms: 0.0 });
            (sc.frame_count, sc.duration_ms)
        } else {
            let content_str = std::fs::read_to_string(&path).unwrap_or_default();
            let frames: Vec<serde_json::Value> = serde_json::from_str(&content_str).unwrap_or_default();
            let fc = frames.len();
            let dm = frames.last().and_then(|f| f.get("time").or_else(|| f.get("timestamp"))).and_then(|t| t.as_f64()).unwrap_or(0.0);
            (fc, dm)
        };

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
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    let file_name = format!("{}.json", safe_name);
    let path = dir.join(&file_name);

    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, &json).map_err(|e| e.to_string())?;

    // Write a lightweight sidecar so list_recordings can skip full deserialization.
    let frames = data.as_array();
    let frame_count = frames.map(|f| f.len()).unwrap_or(0);
    let duration_ms = frames
        .and_then(|f| f.last())
        .and_then(|f| f.get("time").or_else(|| f.get("timestamp")))
        .and_then(|t| t.as_f64())
        .unwrap_or(0.0);
    let sidecar = serde_json::json!({ "frameCount": frame_count, "durationMs": duration_ms });
    let sidecar_path = path.with_extension("meta.json");
    let _ = std::fs::write(&sidecar_path, serde_json::to_string(&sidecar).unwrap_or_default());

    Ok(())
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
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        let sidecar = path.with_extension("meta.json");
        if sidecar.exists() {
            let _ = std::fs::remove_file(&sidecar);
        }
        Ok(())
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
            load_can_profiles,
            save_can_profiles,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Tauri application");
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
        let frame =
            build_linux_can_frame(0x7FF, vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false, false);

        assert_eq!(frame.can_dlc, 8);
        assert_eq!(frame.data, [1, 2, 3, 4, 5, 6, 7, 8]);

        let decoded = decode_linux_can_frame(frame);
        assert_eq!(decoded["dlc"], 8);
        assert_eq!(decoded["data"], serde_json::json!([1, 2, 3, 4, 5, 6, 7, 8]));
    }
}
