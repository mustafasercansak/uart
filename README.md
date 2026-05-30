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

## ✅ Test & Coverage Procedure

### Frontend / TypeScript

```bash
npm run lint
npm test
npm run test:coverage
npx tsc --noEmit
```

The frontend coverage report uses Vitest V8 coverage and is written to `coverage/`.
Coverage is at **100% statements, branches, functions, and lines** (842 tests across 46 test files).
ESLint is configured to ignore generated files under `src-tauri/target/**` so Rust/Tauri build artifacts do not create false-positive parse errors.

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

The HTML report is written to `src-tauri/target/llvm-cov/html/index.html`. Rust coverage is at **100% regions, functions, and lines** (20 tests). For SocketCAN changes, run the Rust tests first, then validate the Linux virtual bus manually:

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
