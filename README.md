# UART Simulator Pro
### Medical-Grade Telemetry & Hardware Engineering Ecosystem

![License](https://img.shields.io/badge/license-MIT-emerald?style=flat-square)
![Version](https://img.shields.io/badge/version-1.6.0-blue?style=flat-square)
![Stack](https://img.shields.io/badge/stack-tauri--rust--react-red?style=flat-square)
![Compliance](https://img.shields.io/badge/compliance-ISO--13485--ready-blue?style=flat-square)

> **[Live Showcase →](https://mustafasercansak.github.io/uart/)**

**UART Simulator Pro** is an advanced engineering platform designed for the comprehensive simulation, validation, and analysis of serial telemetry protocols. Engineered for medical-grade reliability, it provides a bit-perfect virtual twin of UART communication layers, enabling deterministic testing of SpO2, ECG, and respiratory monitoring systems.

---

## 🚀 Key Capabilities

- **Dual Operation Modes:** Seamlessly switch between clinical **Standard Mode** and engineering-focused **Pro (Analyzer) Mode**.
- **20+ Specialized Modules:** Bit-level logic analysis, protocol diffing, signal integrity simulation, 3D visualization, and more.
- **Automation & Scenarios:** Scripted clinical events and automated handshakes for comprehensive HIL (Hardware-in-the-Loop) testing.
- **CAN Bus Tooling:** Dedicated CAN Dashboard with multi-node simulation, arbitration visibility, fault injection, medical profiles, and passive Smart Listen baud-rate detection.
- **UART Device Library:** GPS/NMEA, AT-command, Modbus RTU, IMU/AHRS binary, barcode, RFID, and digital-scale simulators with serial/TCP output.
- **Binary-Aware Console:** Switch between ASCII, grouped hexadecimal, and combined views while inspecting live frames.
- **Persistent Device Workbench:** Device configurations and recent event-device history are restored across application restarts.
- **UDS / ISO-TP Diagnostics:** Full ISO 14229 diagnostic layer over CAN — Session Control, Read DID, Read DTC, multi-frame ISO-TP segmentation/reassembly, and a Symphony auto-responder ECU simulator.
- **J1939 Frame Decoder:** Decodes all SAE J1939 fields (priority, PGN, PF/PS, source/destination) from 29-bit extended IDs with PGN name lookup directly in the Frame Inspector.
- **DBC File Parser:** Full signal extraction — Intel/Motorola byte order, multiplexing, value tables, and physical-value decoding via `extractSignalValue()`.
- **Full i18n:** Complete English and Turkish localisation with a custom-labels editor; zero hardcoded strings across all modules.
- **Medical Validation:** Integrated compliance suite with automated PDF report generation for regulatory auditing.
- **Enterprise Updates:** Built-in auto-updater system for seamless delivery of new protocol definitions and engineering tools.
- **Cross-Platform Excellence:** High-performance Rust-based core running on Windows, macOS, and Linux.

---

## 🏗️ Technical Architecture

- **Backend:** Tauri v2 & Rust (Low-level I/O, memory safety).
- **Frontend:** React 19 & TypeScript (High-density UI).
- **Engines:** Multithreaded Web Workers (AOT signal processing).
- **Visualization:** uPlot & Canvas (High-frequency rendering).

---

## 📖 Getting Started

1. **Prerequisites:** Node.js (>=24) and Rust (Cargo).
2. **Install:** `npm install`
3. **Run Dev:** `npm run tauri:dev`
4. **Build:** `npm run tauri:build`

For a detailed breakdown of all modules and architectural metrics, see [SHOWCASE.md](./SHOWCASE.md).

---

## 🔌 UART Device Library

Open **Devices** to configure and run the included simulators. Each device can
write to the internal log, a physical or virtual serial port, a TCP client, or
a TCP server.

| Phase | Device family | Protocol behavior | Example |
|------:|---------------|-------------------|---------|
| 1 | GPS / GNSS | NMEA 0183 GPGGA, GPRMC, and GPGSV streams | [`01_gps_nmea`](public/examples/01_gps_nmea/) |
| 2 | AT Commands | SIM800, HC-05, and ESP-AT responses and events | [`02_at_commands`](public/examples/02_at_commands/) |
| 3 | Modbus RTU | FC01, FC03, FC04, and FC06 slave behavior | [`03_modbus_rtu`](public/examples/03_modbus_rtu/) |
| 4 | IMU / AHRS | Little-endian MPU-6050 and BNO055 binary frames | [`04_imu_binary`](public/examples/04_imu_binary/) |
| 5 | Event Devices | Barcode, RFID, and digital-scale ASCII bursts | [`05_event_devices`](public/examples/05_event_devices/) |

Phase 5 supports manual triggers and automatic intervals. Device settings are
saved locally, and recent event history remains available after restart.

The serial console provides **ASCII**, **HEX**, and **BOTH** display modes.

### Virtual Serial Validation

```bash
pip install pyserial
npm run test:serial
```

The smoke harness validates all five shipped Python examples through real
pseudo-terminal serial devices, including Modbus request/response and CRC.

---

## ✅ Test & Coverage Procedure

### Frontend / TypeScript

```bash
npm run lint
npm test
npm run test:serial
npm run test:coverage
npx tsc --noEmit
```

The frontend coverage report uses Vitest V8 coverage and is written to `coverage/`.
ESLint is configured to ignore generated files under `src-tauri/target/**` so Rust/Tauri build artifacts do not create false-positive parse errors.

**Frontend coverage summary (Vitest V8 · 842 tests · 46 files):**

| Metric     | Covered | Total | Rate     |
|------------|--------:|------:|:--------:|
| Statements |    2992 |  2992 | **100%** |
| Branches   |    2010 |  2010 | **100%** |
| Functions  |     479 |   479 | **100%** |
| Lines      |    2665 |  2665 | **100%** |

### Rust / Tauri

```bash
npm run test:rust
npm run test:rust:coverage:summary
cargo check --manifest-path src-tauri/Cargo.toml
```

Rust coverage is not built into Cargo by default. Use `cargo-llvm-cov` when a line/HTML report is needed:

```bash
cargo install cargo-llvm-cov
npm run test:rust:coverage
```

The HTML report is written to `src-tauri/target/llvm-cov/html/index.html`.

**Rust coverage summary (`cargo-llvm-cov` · 20 tests · `src-tauri/src/lib.rs`):**

| Metric    | Covered | Total | Rate     |
|-----------|--------:|------:|:--------:|
| Regions   |     616 |   616 | **100%** |
| Functions |      44 |    44 | **100%** |
| Lines     |     338 |   338 | **100%** |

For SocketCAN changes, run the Rust tests first, then validate the Linux virtual bus manually:

```bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
candump vcan0
cansend vcan0 123#1122334455667788
```

In the app, select `SocketCAN (Linux)`, connect to `vcan0`, and confirm the frame appears in the CAN Bus Monitor.

For manual TX/RX validation, start the app in SocketCAN mode, connect to `vcan0`, send a frame from the Bus Monitor injection bar, and confirm it is shown as `TX`. Then run `cansend vcan0 123#1122334455667788` from a terminal and confirm the incoming frame is shown as `RX`.

For automated frame response testing (e.g. reply to a specific incoming frame), use the CAN Automation tab inside the app, or run a quick shell loop from a terminal:

```bash
# Automatically reply to any frame with ID 0x200 and data 01 02 03 04
candump vcan0 | while IFS= read -r line; do
  echo "$line" | grep -q "200.*01 02 03 04" && cansend vcan0 000#01020305
done
```

`SocketCAN (Linux)` depends on the Linux kernel CAN stack and is not available on Windows. On Windows, use `SLCAN (Serial)` with a USB-CAN/SLCAN adapter; selecting SocketCAN will fail gracefully instead of breaking the app.

---

## 📜 Legal & Compliance

Developed by **Mustafa Sercan Sak** ([Connect on LinkedIn](https://www.linkedin.com/in/mustafa-sercan-sak-30190684/)).  
© 2026 UART Simulator Pro. Precision Engineering for Medical Excellence.
