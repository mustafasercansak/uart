# 🔬 UART PRO LAB — Master Engineering Manual
## Professional Simulation, Diagnostic & Validation Suite v1.4.0

Welcome to the **UART Pro Lab Master Manual**. This document provides an exhaustive technical and operational guide to the most advanced UART simulation environment.

---

## 📑 Table of Contents
1. [🏗️ System Architecture](#architecture)
2. [🎨 Custom Waveform Designer](#waveform-designer)
3. [📡 Signal Integrity Theory](#signal-integrity)
4. [📊 Dashboard Deep-Dive (High-Density)](#dashboard-details)
5. [🔬 Advanced Lab Modules](#advanced-lab)
6. [📈 DSP & Spectral Analysis](#dsp-analysis)
7. [📋 Configuration & Templates](#config-templates)
8. [📄 Validation & Reporting](#validation-reporting)
9. [🛠️ Protocol Engineering](#protocol-engineering)
10. [🧪 Clinical Validation](#clinical-validation)
11. [🤖 Automation & Scripting](#automation)
12. [🎞️ Session Management](#session-management)
13. [🛠️ Troubleshooting & Optimization](#troubleshooting)

---

<a name="architecture"></a>
## 🏗️ System Architecture

UART Pro Lab is built on a **Tauri 2 + Web Worker** architecture. It runs as a fully native desktop application with no server dependency.

- **Tauri (Rust) Layer**: Real serial port communication (via the `serialport` crate) and TCP networking run here, providing low-latency direct hardware access.
- **Web Worker Engine**: The simulation engine (`simulation.worker.ts`) runs in a dedicated browser thread so the UI never blocks. On crash it automatically restarts (up to 5 times).
- **React UI Layer**: Built with Vite + React 19. State is managed with `useReducer` + `Zustand`; high-frequency data (waveform history) is kept in `useRef` outside React state to prevent unnecessary re-renders.

![System Dashboard](images/v1.2/dashboard_tr.png)

---

<a name="waveform-designer"></a>
## 🎨 Custom Waveform Designer

New in v1.4.0, the **Waveform Designer** allows you to go beyond static wave patterns.

### 1. Freehand Draw
- **Usage**: Sketch your own signal directly on the canvas using your mouse or touch screen.
- **Technical**: Sketch coordinates are normalized to 0-255 byte values in real-time and injected into the UART stream.

### 2. Mathematical Expressions (Formula)
- **Usage**: Generate dynamic signals using complex JS expressions like `Math.sin(t) * Math.exp(-t/100)`.
- **Parameters**: Use `t` (milliseconds), `i` (packet index), and `f` (current fields) to build interactive formulas.

### 3. Medical Preset Library
- **ECG (P-QRS-T)**: Clinical standard cardiac signals.
- **PPG (Pulse)**: SpO2 and pulse plethysmography waves.
- **Ventilation**: Respiratory flow and pressure curves.

---

<a name="signal-integrity"></a>
## 📡 Signal Integrity Theory

Simulating a "perfect" UART line is easy, but real-world hardware is messy. Our **Integrity Lab** allows you to simulate physical layer degradation.

### 1. Gaussian Noise Injection
- **Theory**: We add random voltage fluctuations to the simulated signal. This tests how your receiver's comparator logic handles "fuzzy" bits.

### 2. Micro-Jitter
- **Theory**: In real systems, the time between packets isn't constant. Jitter simulates the drift caused by CPU scheduling or interrupt latency.

---

<a name="dashboard-details"></a>
## 📊 Dashboard Deep-Dive (High-Density)

In v1.4.0, the interface has been upgraded to professional diagnostic station standards.

### 📐 Bento-Grid & Information Density
- **Compact Layout**: Information density increased by 60%. All telemetry, waveforms, and diagnostics are visible on a single screen without scrolling.
- **13px Typography**: Optimized font hierarchy to fit more data without compromising diagnostic readability.

### 📈 Waveform Analyzer
- **Interpolation**: We use **Cubic Spline** interpolation. This is critical for medical waveforms; without it, an ECG would look like a series of "stairs".
- **Cursors**: Use the vertical cursors to measure the distance between two peaks. Δt (Delta-Time) is calculated with microsecond resolution.

![Waveform Analysis](images/v1.2/waveforms_live.png)

---

<a name="advanced-lab"></a>
## 🔬 Advanced Lab Modules

### 🧪 Differential Analysis (Lab Diff)
- **Bit-Level Comparison**: Select any two frames from history to perform a "diff". The system highlights exactly which bits changed.

![Lab Diff](images/v1.2/lab_diff_live.png)

---

<a name="dsp-analysis"></a>
## 📈 DSP & Spectral Analysis

### 📊 FFT Spectrum Analyzer
- **Transformation**: Converts time-domain data into the frequency domain using **Fast Fourier Transform (FFT)**.
- **Windowing**: Hanning, Hamming, and Rectangular.

![Spectral Analysis](images/v1.2/spectrum_live.png)

---

<a name="config-templates"></a>
## 📋 Configuration & Templates

### 🛠️ Profile Template Editor
- **Visual Dissector**: Define the structure of your UART packets without writing code.

![Profile Editor](images/v1.2/profile_editor_live.png)

---

<a name="validation-reporting"></a>
## 📄 Validation & Reporting

### 📜 Validation Report (PDF Export)
- **Compliance Scoring**: Automatically calculates a final "Health Score".

![Validation Report](images/v1.2/report_live.png)

---

<a name="automation"></a>
## 🤖 Automation & Scripting

### Dynamic Responder Scripting
You can write JavaScript to create an interactive "Digital Twin".
```javascript
onReceive((data) => {
  if (data[0] === 0x05) {
    send([0xAA, 0x05, batteryLevel, 0xFF]);
  }
});
```

---

<a name="troubleshooting"></a>
## 🛠️ Troubleshooting & Optimization

1. **Framing Errors (0xFE)**: Verify baud rate.
2. **Sync Loss**: Check "Sync Byte" in Profile Editor.
3. **Performance**: Keep GPU acceleration enabled for high-speed simulations.

---

## 🏁 Conclusion
The **UART Pro Lab** is more than a simulator; it is a complete medical validation and signal engineering environment.

*Mustafa Sercan Sak — Chief Architect*
© 2026 Mustafa Sercan Sak Diagnostics
