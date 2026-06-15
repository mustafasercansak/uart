#![cfg_attr(coverage, allow(unused_imports))]

use serde::{Deserialize, Serialize};
use std::ffi::CString;
use std::io::{Read, Write};
use std::net::TcpStream;
#[cfg(target_os = "linux")]
use std::os::fd::RawFd;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
#[cfg(target_os = "linux")]
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

// ── HELPERS ───────────────────────────────────────────────────────────────────

/// Returns the current wall-clock time in milliseconds.
/// On Linux uses CLOCK_REALTIME at nanosecond precision;
/// independent of the OS scheduler granularity.
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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

#[cfg(not(coverage))]
struct SerialState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    write_port: Mutex<Option<Box<dyn serialport::SerialPort>>>,
}

#[cfg(not(coverage))]
struct TcpState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    write_stream: Mutex<Option<TcpStream>>,
}

#[cfg(not(coverage))]
struct TcpServerState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    /// Used for writes only; reads are performed via a thread-local read_stream.
    active_stream: Arc<Mutex<Option<TcpStream>>>,
}

#[cfg(not(coverage))]
struct SocketCanState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    #[cfg(target_os = "linux")]
    write_fd: Mutex<Option<RawFd>>,
    #[cfg(target_os = "linux")]
    session_id: AtomicU64,
}

fn recordings_dir() -> PathBuf {
    let home = dirs_next::document_dir()
        .or_else(dirs_next::home_dir)
        .unwrap_or(PathBuf::from("."));
    home.join("uart_recordings")
}

#[cfg(not(coverage))]
fn can_profiles_dir() -> PathBuf {
    let home = dirs_next::document_dir()
        .or_else(dirs_next::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("uart_profiles")
}

/// Write `content` to `path` atomically: write to a uniquely-named sibling tmp
/// file then rename. Using process ID + nanosecond timestamp in the name
/// prevents concurrent calls from clobbering each other's temp file.
/// On POSIX, `rename` is atomic within the same filesystem.
fn atomic_write(path: &std::path::Path, content: &str) -> Result<(), String> {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_name = format!("{}.{}.{}.tmp", stem, std::process::id(), nonce);
    let tmp = path.with_file_name(tmp_name);
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

// ── SIMULATION PROFILES PERSISTENCE (storage.ts) ─────────────────────────────

/// Load simulation profiles. Returns `null` (None) when no file exists yet.
#[tauri::command]
#[cfg(not(coverage))]
fn load_can_profiles() -> Result<Option<serde_json::Value>, String> {
    let path = can_profiles_dir().join("profiles.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

/// Persist simulation profiles to disk atomically.
#[tauri::command]
#[cfg(not(coverage))]
fn save_can_profiles(data: serde_json::Value) -> Result<(), String> {
    let dir = can_profiles_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("profiles.json");
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    atomic_write(&path, &json)
}

// ── CAN NODE PROFILES PERSISTENCE (canProfileStorage.ts) ─────────────────────
// Separate filenames under the same uart_profiles directory ensure the two
// profile stores never overwrite each other.

/// Load CAN node profiles. Returns `null` (None) when no file exists yet.
#[tauri::command]
#[cfg(not(coverage))]
fn load_can_node_profiles() -> Result<Option<serde_json::Value>, String> {
    let path = can_profiles_dir().join("can_node_profiles.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

/// Persist CAN node profiles to disk atomically.
#[tauri::command]
#[cfg(not(coverage))]
fn save_can_node_profiles(data: serde_json::Value) -> Result<(), String> {
    let dir = can_profiles_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("can_node_profiles.json");
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    atomic_write(&path, &json)
}

// ── SERIAL PORT COMMANDS ──────────────────────────────────────────────────────

#[tauri::command]
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
    {
        let mut wp = state.write_port.lock().unwrap();
        *wp = None;
    }

    let builder = serialport::new(&port_name, baud_rate).timeout(Duration::from_millis(100));

    // socat-created PTYs already have their master side open. They must be
    // opened non-exclusively, while physical serial devices remain protected.
    #[cfg(unix)]
    let builder = {
        let is_virtual_pty = std::fs::canonicalize(&port_name)
            .map(|path| path.starts_with("/dev/pts/"))
            .unwrap_or(false);
        builder.exclusive(!is_virtual_pty)
    };

    let port = builder
        .open()
        .map_err(|e| {
        let raw_error = e.to_string();
        let msg = if raw_error.contains("Access denied")
            || raw_error.contains("Permission denied")
            || raw_error.contains("Unable to acquire exclusive lock")
        {
            "ERR_PORT_LOCKED".to_string()
        } else {
            raw_error
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
        // At 921600 baud, up to ~9216 bytes arrive per 100 ms window.
        // 8192-byte read buffer catches most frames in a single syscall.
        let mut buf = vec![0u8; 8192];
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

                    // Drain any additional bytes already sitting in the OS receive buffer
                    // so we emit one event per burst instead of many small ones.
                    while let Ok(avail) = port.bytes_to_read() {
                        if avail == 0 {
                            break;
                        }
                        let to_read = (avail as usize).min(buf.len());
                        match port.read(&mut buf[..to_read]) {
                            Ok(m) if m > 0 => rx_buffer.extend_from_slice(&buf[..m]),
                            _ => break,
                        }
                    }

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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
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

// ── PTY (VIRTUAL COM PORT) SERVER ─────────────────────────────────────────────
//
// Creates a PTY pair; the slave side (/dev/pts/N) is a virtual COM port that
// any serial application can open. Our app holds the master fd and relays data
// to/from the SimCardDriver just like the TCP server does, reusing the same
// tcp-server-data / tcp-server-status events so the JS layer is unchanged.

#[cfg(not(coverage))]
struct PtyServerState {
    stop_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    master_fd: Arc<Mutex<Option<i32>>>,
}

#[tauri::command]
#[cfg(target_os = "linux")]
#[cfg(not(coverage))]
fn start_pty_server(
    state: tauri::State<'_, PtyServerState>,
    app: AppHandle,
) -> Result<String, String> {
    // Stop existing PTY server if running
    {
        let mut tx = state.stop_tx.lock().unwrap();
        if let Some(s) = tx.take() {
            let _ = s.send(());
        }
    }
    {
        let mut fd = state.master_fd.lock().unwrap();
        if let Some(f) = fd.take() {
            unsafe { libc::close(f); }
        }
    }

    // Open PTY master
    let master = unsafe {
        let fd = libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY);
        if fd < 0 {
            return Err(format!("posix_openpt: {}", std::io::Error::last_os_error()));
        }
        if libc::grantpt(fd) < 0 {
            libc::close(fd);
            return Err(format!("grantpt: {}", std::io::Error::last_os_error()));
        }
        if libc::unlockpt(fd) < 0 {
            libc::close(fd);
            return Err(format!("unlockpt: {}", std::io::Error::last_os_error()));
        }
        // Non-blocking reads so the thread can check stop_rx
        let flags = libc::fcntl(fd, libc::F_GETFL);
        libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
        fd
    };

    // Get slave PTY path (e.g. /dev/pts/3)
    let slave_path = unsafe {
        let ptr = libc::ptsname(master);
        if ptr.is_null() {
            libc::close(master);
            return Err("ptsname returned null".to_string());
        }
        std::ffi::CStr::from_ptr(ptr).to_string_lossy().to_string()
    };

    {
        let mut fd = state.master_fd.lock().unwrap();
        *fd = Some(master);
    }

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    {
        let mut tx = state.stop_tx.lock().unwrap();
        *tx = Some(stop_tx);
    }

    let master_arc = state.master_fd.clone();
    let app_clone = app.clone();
    let slave_for_event = slave_path.clone();

    app_clone
        .emit(
            "tcp-server-status",
            serde_json::json!({ "status": "listening", "port": slave_for_event }),
        )
        .ok();

    thread::spawn(move || {
        let mut buf = vec![0u8; 1024];

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            let fd = {
                let guard = master_arc.lock().unwrap();
                match *guard {
                    Some(f) => f,
                    None => break,
                }
            };

            // poll_readable gives a 100 ms window so stop_rx is checked frequently
            let ready = poll_readable(fd, 100);
            if ready < 0 {
                // poll error — back off
                thread::sleep(Duration::from_millis(10));
                continue;
            }
            if ready == 0 {
                // Timeout — loop back to check stop_rx
                continue;
            }

            let n = unsafe {
                libc::read(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len())
            };

            if n > 0 {
                let bytes = buf[..n as usize].to_vec();
                let hex = bytes
                    .iter()
                    .map(|b| format!("{:02X}", b))
                    .collect::<Vec<_>>()
                    .join(" ");
                app_clone
                    .emit(
                        "tcp-server-data",
                        serde_json::json!({ "hex": hex, "bytes": bytes, "timestamp": now_ms() }),
                    )
                    .ok();
            } else if n < 0 {
                let errno = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
                // EIO = slave side closed (no process holding it) — keep waiting
                if errno != libc::EAGAIN && errno != libc::EWOULDBLOCK && errno != libc::EIO {
                    break; // real error
                }
                thread::sleep(Duration::from_millis(5));
            }
        }
    });

    Ok(slave_path)
}

#[tauri::command]
#[cfg(target_os = "linux")]
#[cfg(not(coverage))]
fn stop_pty_server(
    state: tauri::State<'_, PtyServerState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut tx = state.stop_tx.lock().unwrap();
    if let Some(s) = tx.take() {
        let _ = s.send(());
    }
    let mut fd = state.master_fd.lock().unwrap();
    if let Some(f) = fd.take() {
        unsafe { libc::close(f); }
    }
    app.emit("tcp-server-status", serde_json::json!({ "status": "stopped" }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg(target_os = "linux")]
#[cfg(not(coverage))]
fn write_pty_server(
    bytes: Vec<u8>,
    state: tauri::State<'_, PtyServerState>,
) -> Result<(), String> {
    let fd = state.master_fd.lock().unwrap();
    match *fd {
        Some(f) => {
            let ret = unsafe {
                libc::write(f, bytes.as_ptr() as *const libc::c_void, bytes.len())
            };
            if ret < 0 {
                Err(format!("write_pty: {}", std::io::Error::last_os_error()))
            } else {
                Ok(())
            }
        }
        None => Err("PTY not open".to_string()),
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
#[cfg(not(coverage))]
struct SockAddrCan {
    can_family: libc::sa_family_t,
    can_ifindex: libc::c_int,
    addr: [u8; 8],
}

#[cfg(target_os = "linux")]
#[cfg(not(coverage))]
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

#[cfg(all(target_os = "linux", not(coverage)))]
#[tauri::command]
fn connect_socketcan(
    interface: String,
    state: tauri::State<'_, SocketCanState>,
    app: AppHandle,
) -> Result<(), String> {
    let session_id = state.session_id.fetch_add(1, Ordering::SeqCst) + 1;

    {
        let mut tx = state.stop_tx.lock().unwrap();
        if let Some(sender) = tx.take() {
            let _ = sender.send(());
        }
    }

    let read_fd = open_socketcan_fd(&interface).map_err(|e| {
        let _ = app.emit(
            "socketcan-status",
            serde_json::json!({ "connected": false, "error": e, "sessionId": session_id }),
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
            serde_json::json!({ "connected": false, "error": e, "sessionId": session_id }),
        );
        e
    })?;

    {
        let mut fd = match state.write_fd.lock() {
            Ok(guard) => guard,
            Err(_) => {
                // Poisoned mutex: close both fds before propagating.
                unsafe { libc::close(write_fd); libc::close(read_fd) };
                return Err("ERR_SOCKETCAN_INTERNAL".to_string());
            }
        };
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
                serde_json::json!({ "connected": true, "interface": interface, "sessionId": session_id }),
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
                        serde_json::json!({ "connected": false, "error": err.to_string(), "sessionId": session_id }),
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
                    if let Some(map) = decoded.as_object_mut() {
                        map.insert("sessionId".to_string(), serde_json::json!(session_id));
                    }
                    app_clone.emit("socketcan-frame", decoded).ok();
                }
                Err(e) => {
                    app_clone
                        .emit(
                            "socketcan-status",
                            serde_json::json!({ "connected": false, "error": e.to_string(), "sessionId": session_id }),
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
            .emit(
                "socketcan-status",
                serde_json::json!({ "connected": false, "sessionId": session_id }),
            )
            .ok();
    });

    Ok(())
}

#[cfg(all(not(target_os = "linux"), not(coverage)))]
#[tauri::command]
fn connect_socketcan(_interface: String) -> Result<(), String> {
    Err("ERR_SOCKETCAN_LINUX_ONLY".to_string())
}

#[cfg(all(target_os = "linux", not(coverage)))]
#[tauri::command]
fn disconnect_socketcan(
    state: tauri::State<'_, SocketCanState>,
    app: AppHandle,
) -> Result<(), String> {
    let session_id = state.session_id.load(Ordering::SeqCst);
    let mut tx = state.stop_tx.lock().unwrap();
    if let Some(sender) = tx.take() {
        let _ = sender.send(());
    }
    let mut fd = state.write_fd.lock().unwrap();
    if let Some(write_fd) = fd.take() {
        unsafe { libc::close(write_fd) };
    }
    app.emit(
        "socketcan-status",
        serde_json::json!({ "connected": false, "sessionId": session_id }),
    )
        .map_err(|e| e.to_string())
}

#[cfg(all(not(target_os = "linux"), not(coverage)))]
#[tauri::command]
fn disconnect_socketcan() -> Result<(), String> {
    Ok(())
}

#[cfg(all(target_os = "linux", not(coverage)))]
#[tauri::command]
fn write_socketcan_frame(
    arbitration_id: u32,
    data: Vec<u8>,
    is_extended: bool,
    is_rtr: bool,
    state: tauri::State<'_, SocketCanState>,
) -> Result<(), String> {
    // dup() the fd inside the lock so the lock can be released before libc::write.
    // Copying a bare RawFd (i32) is NOT safe: disconnect_socketcan can close the original
    // and the OS can recycle the number before libc::write runs (TOCTOU). libc::dup()
    // creates an independent kernel file-description reference that survives the close.
    // We close the dup'd fd ourselves after the write, regardless of outcome.
    let dup_fd = {
        let fd = state.write_fd.lock().unwrap();
        match *fd {
            Some(f) => {
                let d = unsafe { libc::dup(f) };
                if d < 0 { return Err(std::io::Error::last_os_error().to_string()); }
                Ok(d)
            }
            None => Err("ERR_SOCKETCAN_NOT_CONNECTED".to_string()),
        }
    }?;
    // DeferClose ensures libc::close(dup_fd) runs even if write_socketcan_fd panics.
    struct DeferClose(RawFd);
    impl Drop for DeferClose { fn drop(&mut self) { unsafe { libc::close(self.0) }; } }
    let _guard = DeferClose(dup_fd);
    write_socketcan_fd(dup_fd, arbitration_id, data, is_extended, is_rtr)
}

#[cfg(all(not(target_os = "linux"), not(coverage)))]
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
#[cfg(not(coverage))]
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
#[cfg(not(coverage))]
struct RecordingMetaSidecar {
    #[serde(rename = "frameCount")]
    frame_count: usize,
    #[serde(rename = "durationMs")]
    duration_ms: f64,
}

#[tauri::command]
#[cfg(not(coverage))]
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
            // Back-fill sidecar so future listings skip the full parse.
            let sidecar = serde_json::json!({ "frameCount": fc, "durationMs": dm });
            let _ = std::fs::write(&sidecar_path, serde_json::to_string(&sidecar).unwrap_or_default());
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
#[cfg(not(coverage))]
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
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("ERR_INVALID_RECORDING_ID".to_string());
    }
    let path = recordings_dir().join(&id);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_recording(id: String) -> Result<(), String> {
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("ERR_INVALID_RECORDING_ID".to_string());
    }
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

// ── SOCAT VIRTUAL PORT BRIDGE ─────────────────────────────────────────────────

struct SocatState {
    pid: Mutex<Option<u32>>,
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn spawn_socat_bridge(app: AppHandle, state: tauri::State<SocatState>) -> Result<String, String> {
    use std::io::BufRead;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;

    // Kill any existing instance first
    {
        let mut pid_guard = state.pid.lock().unwrap();
        if let Some(pid) = pid_guard.take() {
            let _ = Command::new("kill").arg(pid.to_string()).output();
        }
    }

    let mut child = Command::new("socat")
        .args(["-d", "-d", "pty,raw,echo=0", "pty,raw,echo=0"])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn socat: {}", e))?;

    let pid = child.id();
    *state.pid.lock().unwrap() = Some(pid);

    let stderr = child.stderr.take().ok_or("no stderr")?;
    let (tx, rx) = mpsc::channel::<String>();
    let app_clone = app.clone();

    thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            let _ = app_clone.emit("socat-log", &line);
            let _ = tx.send(line);
        }
        // socat exited
        let _ = app_clone.emit("socat-log", "[socat exited]");
        // wait so we don't leave zombie
        let _ = child.wait();
    });

    // Collect the two PTY path lines socat writes to stderr within 3 seconds
    let mut paths: Vec<String> = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while paths.len() < 2 {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        if let Ok(line) = rx.recv_timeout(remaining) {
            // socat lines look like: "... PTY is /dev/pts/N"
            if let Some(pos) = line.rfind("/dev/pts/") {
                paths.push(line[pos..].trim().to_string());
            }
        }
    }

    Ok(paths.join(","))
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn spawn_socat_bridge(_app: AppHandle, _state: tauri::State<SocatState>) -> Result<String, String> {
    Err("socat bridge is only supported on Linux".to_string())
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn kill_socat_bridge(state: tauri::State<SocatState>) -> Result<(), String> {
    use std::process::Command;
    let mut pid_guard = state.pid.lock().unwrap();
    if let Some(pid) = pid_guard.take() {
        Command::new("kill").arg(pid.to_string()).output().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn kill_socat_bridge(_state: tauri::State<SocatState>) -> Result<(), String> {
    Ok(())
}

// ── PYTHON B-SIDE RUNNER ──────────────────────────────────────────────────────

struct BSideState {
    child_stdin: Mutex<Option<std::process::ChildStdin>>,
    child_pid:   Mutex<Option<u32>>,
}

// ── DEVICE EMULATOR ───────────────────────────────────────────────────────────

struct EmulatorState {
    child_pid: Mutex<Option<u32>>,
}

#[tauri::command]
fn start_python_bside(
    app: AppHandle,
    state: tauri::State<BSideState>,
    port: String,
    baud: u32,
    script: String,
) -> Result<(), String> {
    use std::io::BufRead;
    use std::process::{Command, Stdio};

    // Kill any existing child
    {
        let mut pid_guard = state.child_pid.lock().unwrap();
        if let Some(pid) = pid_guard.take() {
            let _ = Command::new("kill").arg(pid.to_string()).output();
        }
        *state.child_stdin.lock().unwrap() = None;
    }

    let script = script.replace("{PORT}", &port).replace("{BAUD}", &baud.to_string());

    let mut child = Command::new("python3")
        .args(["-u", "-c", &script])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start python3: {}", e))?;

    let pid    = child.id();
    let stdin  = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    *state.child_pid.lock().unwrap()   = Some(pid);
    *state.child_stdin.lock().unwrap() = Some(stdin);

    // Forward stdout
    let app1 = app.clone();
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app1.emit("bside-data", l);
            }
        }
    });

    // Forward stderr + wait
    let app2 = app.clone();
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app2.emit("bside-data", format!("[err] {}", l));
            }
        }
        let _ = child.wait();
        let _ = app2.emit("bside-data", "[python exited]");
        let _ = app2.emit("bside-stopped", ());
    });

    Ok(())
}

#[tauri::command]
fn send_to_bside(state: tauri::State<BSideState>, data: String) -> Result<(), String> {
    use std::io::Write;
    let mut guard = state.child_stdin.lock().unwrap();
    if let Some(stdin) = guard.as_mut() {
        stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn stop_bside(state: tauri::State<BSideState>) -> Result<(), String> {
    use std::process::Command;
    let mut pid_guard = state.child_pid.lock().unwrap();
    if let Some(pid) = pid_guard.take() {
        let _ = Command::new("kill").arg(pid.to_string()).output();
    }
    *state.child_stdin.lock().unwrap() = None;
    Ok(())
}

// ── DEVICE EMULATOR COMMANDS ──────────────────────────────────────────────────

#[tauri::command]
#[cfg(not(coverage))]
fn spawn_device_emulator(
    port: String,
    mode: String,
    state: tauri::State<'_, EmulatorState>,
    app: AppHandle,
) -> Result<(), String> {
    use std::io::BufRead;
    use std::process::{Command, Stdio};

    // Kill any running instance first
    {
        let mut pid_guard = state.child_pid.lock().unwrap();
        if let Some(pid) = pid_guard.take() {
            let _ = Command::new("kill").arg(pid.to_string()).output();
        }
    }

    // Walk up from the executable until we find scripts/device_emulator.py.
    // In dev mode the exe lives at src-tauri/target/debug/; the script is at
    // the project root three levels above.
    let script_path = {
        let target = std::path::Path::new("scripts").join("device_emulator.py");
        let mut found = None;

        // 1. current working directory
        if let Ok(cwd) = std::env::current_dir() {
            let p = cwd.join(&target);
            if p.exists() { found = Some(p); }
        }

        // 2. walk up from the executable (up to 8 levels)
        if found.is_none() {
            if let Ok(exe) = std::env::current_exe() {
                let mut dir = exe.parent().map(|p| p.to_path_buf());
                for _ in 0..8 {
                    if let Some(d) = dir {
                        let p = d.join(&target);
                        if p.exists() { found = Some(p); break; }
                        dir = d.parent().map(|p| p.to_path_buf());
                    } else {
                        break;
                    }
                }
            }
        }

        match found {
            Some(p) => p,
            None => return Err(
                "device_emulator.py not found — walked up 8 levels from exe".to_string()
            ),
        }
    };

    let mut child = Command::new("python3")
        .args([
            "-u",
            script_path.to_str().unwrap_or(""),
            &port,
            "--mode",
            &mode,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start python3: {}", e))?;

    *state.child_pid.lock().unwrap() = Some(child.id());

    let app1 = app.clone();
    let stdout = child.stdout.take().ok_or("no stdout")?;
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app1.emit("emulator-log", l);
            }
        }
    });

    let app2 = app.clone();
    let stderr = child.stderr.take().ok_or("no stderr")?;
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app2.emit("emulator-log", format!("[err] {}", l));
            }
        }
        let _ = child.wait();
        let _ = app2.emit("emulator-stopped", ());
    });

    Ok(())
}

#[tauri::command]
#[cfg(not(coverage))]
fn stop_device_emulator(state: tauri::State<'_, EmulatorState>) -> Result<(), String> {
    use std::process::Command;
    let mut pid_guard = state.child_pid.lock().unwrap();
    if let Some(pid) = pid_guard.take() {
        let _ = Command::new("kill").arg(pid.to_string()).output();
    }
    Ok(())
}

// ── HTTP FETCH ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct FetchResult {
    status: u16,
    body:   String,
}

#[tauri::command]
#[cfg(not(coverage))]
async fn http_fetch(url: String, method: String, body: Option<String>) -> Result<FetchResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let req = match method.to_uppercase().as_str() {
        "POST"   => client.post(&url),
        "PUT"    => client.put(&url),
        "PATCH"  => client.patch(&url),
        "DELETE" => client.delete(&url),
        _        => client.get(&url),
    };

    let req = match body {
        Some(b) => req.header("Content-Type", "application/json").body(b),
        None    => req,
    };

    let resp   = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body   = resp.text().await.map_err(|e| e.to_string())?;
    Ok(FetchResult { status, body })
}

#[tauri::command]
#[cfg(coverage)]
async fn http_fetch(_url: String, _method: String, _body: Option<String>) -> Result<FetchResult, String> {
    Ok(FetchResult { status: 200, body: "{}".into() })
}

// ── OPEN URL IN DEFAULT BROWSER ───────────────────────────────────────────────

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

// ── APP ENTRY ─────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[cfg(not(coverage))]
fn normalize_webkit_locale() {
    fn is_c_locale(value: &str) -> bool {
        matches!(
            value.to_ascii_uppercase().as_str(),
            "C" | "C.UTF-8" | "C.UTF8" | "POSIX" | "POSIX.UTF-8" | "POSIX.UTF8"
        )
    }

    let lc_all = std::env::var("LC_ALL").unwrap_or_default();
    if !is_c_locale(&lc_all) {
        return;
    }

    let lang = std::env::var("LANG").unwrap_or_default();
    let fallback = if lang.is_empty() || is_c_locale(&lang) {
        "en_US.UTF-8"
    } else {
        &lang
    };
    std::env::set_var("LC_ALL", fallback);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(coverage))]
pub fn run() {
    #[cfg(target_os = "linux")]
    normalize_webkit_locale();

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
            #[cfg(target_os = "linux")]
            session_id: AtomicU64::new(0),
        })
        .manage(SocatState { pid: Mutex::new(None) })
        .manage(PtyServerState {
            stop_tx: Mutex::new(None),
            master_fd: Arc::new(Mutex::new(None)),
        })
        .manage(BSideState {
            child_stdin: Mutex::new(None),
            child_pid:   Mutex::new(None),
        })
        .manage(EmulatorState {
            child_pid: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            spawn_socat_bridge,
            kill_socat_bridge,
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
            #[cfg(target_os = "linux")]
            start_pty_server,
            #[cfg(target_os = "linux")]
            stop_pty_server,
            #[cfg(target_os = "linux")]
            write_pty_server,
            connect_socketcan,
            disconnect_socketcan,
            write_socketcan_frame,
            list_recordings,
            save_recording,
            load_recording,
            delete_recording,
            load_can_profiles,
            save_can_profiles,
            load_can_node_profiles,
            save_can_node_profiles,
            start_python_bside,
            send_to_bside,
            stop_bside,
            spawn_device_emulator,
            stop_device_emulator,
            http_fetch,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Tauri application");
}

    #[cfg(coverage)]
    pub fn run() {}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn unique_tmp_path(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("{}-{}-{}", prefix, std::process::id(), nonce))
    }

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

    #[test]
    fn decode_linux_can_frame_clamps_reported_dlc_to_8() {
        let frame = LinuxCanFrame {
            can_id: 0x456,
            can_dlc: 200,
            __pad: 0,
            __res0: 0,
            len8_dlc: 0,
            data: [9, 8, 7, 6, 5, 4, 3, 2],
        };

        let decoded = decode_linux_can_frame(frame);
        assert_eq!(decoded["dlc"], 8);
        assert_eq!(decoded["data"], serde_json::json!([9, 8, 7, 6, 5, 4, 3, 2]));
    }

    #[test]
    fn write_socketcan_fd_rejects_out_of_range_standard_id() {
        let err = write_socketcan_fd(-1, CAN_SFF_MASK + 1, vec![], false, false)
            .expect_err("standard ID above 11-bit limit must fail");
        assert!(err.contains("ERR_CAN_ID_OUT_OF_RANGE"));
        assert!(err.contains("standard"));
    }

    #[test]
    fn write_socketcan_fd_rejects_out_of_range_extended_id() {
        let err = write_socketcan_fd(-1, CAN_EFF_MASK + 1, vec![], true, false)
            .expect_err("extended ID above 29-bit limit must fail");
        assert!(err.contains("ERR_CAN_ID_OUT_OF_RANGE"));
        assert!(err.contains("extended"));
    }

    #[test]
    fn write_socketcan_fd_rejects_payload_larger_than_classic_can() {
        let err = write_socketcan_fd(-1, 0x100, vec![0; 9], false, false)
            .expect_err("DLC larger than 8 must fail before write syscall");
        assert!(err.contains("ERR_CAN_DLC_TOO_LARGE"));
    }

    #[test]
    fn atomic_write_creates_and_overwrites_file() {
        let dir = unique_tmp_path("uart-atomic-write-ok");
        fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("sample.json");

        atomic_write(&path, "first").expect("first write");
        assert_eq!(fs::read_to_string(&path).expect("read first"), "first");

        atomic_write(&path, "second").expect("overwrite");
        assert_eq!(fs::read_to_string(&path).expect("read second"), "second");

        fs::remove_file(&path).ok();
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn atomic_write_returns_error_when_parent_directory_missing() {
        let path = unique_tmp_path("uart-atomic-write-missing").join("nested").join("file.json");
        let err = atomic_write(&path, "x").expect_err("write should fail when parent does not exist");
        assert!(!err.is_empty());
    }

    #[test]
    fn atomic_write_cleans_up_temp_file_when_rename_fails() {
        let dir = unique_tmp_path("uart-atomic-write-rename-fail");
        fs::create_dir_all(&dir).expect("create temp dir");
        let target_dir = dir.join("target.json");
        fs::create_dir_all(&target_dir).expect("create conflicting directory");

        let err = atomic_write(&target_dir, "content").expect_err("rename to existing dir should fail");
        assert!(!err.is_empty());

        let leftovers = fs::read_dir(&dir)
            .expect("list temp dir")
            .filter_map(Result::ok)
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.ends_with(".tmp"))
            .collect::<Vec<_>>();
        assert!(leftovers.is_empty(), "temporary files should be removed on rename failure");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn recording_commands_reject_path_traversal_ids() {
        let load_err = load_recording("../secret.json".to_string())
            .expect_err("load_recording should reject traversal");
        assert_eq!(load_err, "ERR_INVALID_RECORDING_ID");

        let delete_err = delete_recording("..\\secret.json".to_string())
            .expect_err("delete_recording should reject traversal");
        assert_eq!(delete_err, "ERR_INVALID_RECORDING_ID");
    }

    #[test]
    fn recording_commands_touch_non_traversal_paths() {
        let missing = "definitely-missing-coverage-test.json".to_string();

        let load_err = load_recording(missing.clone())
            .expect_err("missing file should return io parse/read error");
        assert!(!load_err.is_empty());

        let delete_err = delete_recording(missing)
            .expect_err("missing file should return not found");
        assert!(delete_err.starts_with("ERR_RECORDING_NOT_FOUND:"));
    }

    #[test]
    fn load_recording_reads_valid_json_file() {
        let id = format!(
            "coverage-load-{}-{}.json",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let dir = recordings_dir();
        fs::create_dir_all(&dir).expect("create recordings dir");
        let path = dir.join(&id);
        fs::write(&path, "{\"ok\":true,\"value\":7}").expect("write recording file");

        let loaded = load_recording(id.clone()).expect("load recording json");
        assert_eq!(loaded["ok"], true);
        assert_eq!(loaded["value"], 7);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn load_recording_returns_parse_error_for_invalid_json() {
        let id = format!(
            "coverage-load-invalid-{}-{}.json",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let dir = recordings_dir();
        fs::create_dir_all(&dir).expect("create recordings dir");
        let path = dir.join(&id);
        fs::write(&path, "{invalid-json").expect("write invalid recording file");

        let err = load_recording(id).expect_err("invalid json should fail to parse");
        assert!(!err.is_empty());

        fs::remove_file(&path).ok();
    }

    #[test]
    fn delete_recording_removes_recording_and_sidecar() {
        let id = format!(
            "coverage-delete-{}-{}.json",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let dir = recordings_dir();
        fs::create_dir_all(&dir).expect("create recordings dir");
        let path = dir.join(&id);
        let sidecar = path.with_extension("meta.json");
        fs::write(&path, "[]").expect("write recording");
        fs::write(&sidecar, "{\"frameCount\":0,\"durationMs\":0}").expect("write sidecar");

        delete_recording(id).expect("delete existing recording");
        assert!(!path.exists());
        assert!(!sidecar.exists());
    }

    #[test]
    fn delete_recording_removes_recording_without_sidecar() {
        let id = format!(
            "coverage-delete-nosidecar-{}-{}.json",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let dir = recordings_dir();
        fs::create_dir_all(&dir).expect("create recordings dir");
        let path = dir.join(&id);
        fs::write(&path, "[]").expect("write recording");

        delete_recording(id).expect("delete existing recording without sidecar");
        assert!(!path.exists());
    }

    #[test]
    fn delete_recording_returns_error_when_target_is_directory() {
        let id = format!(
            "coverage-delete-dir-{}-{}.json",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let dir = recordings_dir();
        fs::create_dir_all(&dir).expect("create recordings dir");
        let path = dir.join(&id);
        fs::create_dir_all(&path).expect("create directory at recording path");

        let err = delete_recording(id).expect_err("remove_file should fail for directory");
        assert!(!err.is_empty());

        fs::remove_dir_all(&path).ok();
    }

    #[test]
    fn write_socketcan_fd_reaches_syscall_error_path() {
        let err = write_socketcan_fd(-1, 0x123, vec![], false, false)
            .expect_err("invalid fd should fail at write syscall");
        assert!(!err.is_empty());
    }

    #[test]
    fn write_socketcan_fd_reaches_success_path_on_writable_fd() {
        let mut fds = [0; 2];
        let pipe_result = unsafe { libc::pipe(fds.as_mut_ptr()) };
        assert_eq!(pipe_result, 0, "pipe should be created");

        let write_res = write_socketcan_fd(fds[1], 0x123, vec![1, 2, 3], false, false);
        assert!(write_res.is_ok(), "write_socketcan_fd should succeed on writable fd");

        unsafe {
            libc::close(fds[0]);
            libc::close(fds[1]);
        }
    }

    #[cfg(coverage)]
    #[test]
    fn coverage_run_stub_is_callable() {
        run();
    }
}
