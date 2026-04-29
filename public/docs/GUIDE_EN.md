# 🔬 UART PRO LAB — Master Engineering Manual
## Professional Simulation, Diagnostic & Validation Suite v1.2.0

Welcome to the **UART Pro Lab Master Manual**. This document provides an exhaustive technical and operational guide to the most advanced UART simulation environment.

---

## 📑 Table of Contents
1. [🏗️ System Architecture](#architecture)
2. [📡 Signal Integrity Theory](#signal-integrity)
3. [📊 Dashboard Deep-Dive](#dashboard-details)
4. [🛠️ Protocol Engineering](#protocol-engineering)
5. [🧪 Clinical Validation](#clinical-validation)
6. [🤖 Automation & Scripting](#automation)
7. [🛠️ Troubleshooting & Optimization](#troubleshooting)

---

<a name="architecture"></a>
## 🏗️ System Architecture

The UART Pro Lab is built on a **High-Concurrency Real-Time Engine**. Unlike standard simulators that rely on simple loops, our engine uses a **Node.js Worker Thread** architecture to ensure that data generation is decoupled from the UI thread.
- **Precision Timing**: We use `process.hrtime()` for nanosecond-precision intervals, essential for simulating high-speed baud rates (up to 921,600 bps) without jitter.
- **Zero-Copy Buffers**: Data is transmitted between the engine and the UI using shared memory or high-speed WebSockets to minimize latency.

![System Dashboard](/docs/images/v1.2/dashboard_en.png)

---

<a name="signal-integrity"></a>
## 📡 Signal Integrity Theory

Simulating a "perfect" UART line is easy, but real-world hardware is messy. Our **Integrity Lab** allows you to simulate physical layer degradation.

### 1. Gaussian Noise Injection
- **Theory**: We add random voltage fluctuations to the simulated signal. This tests how your receiver's comparator logic handles "fuzzy" bits.
- **Impact**: High noise levels will trigger **Framing Errors** or incorrect bit detection in your MCU.

### 2. Micro-Jitter
- **Theory**: In real systems, the time between packets isn't constant. Jitter simulates the drift caused by CPU scheduling or interrupt latency in the sender.
- **Impact**: Tests your RX Buffer's ability to handle bursty traffic without overflowing.

### 3. Bit-Flipping / BER (Bit Error Rate)
- **Theory**: Simulates Electromagnetic Interference (EMI). We randomly toggle a 0 to 1 (or vice versa).
- **Impact**: Essential for testing **Checksum (CRC)** robustness. If your code doesn't catch a flipped bit, your medical data is compromised.

---

<a name="dashboard-details"></a>
## 📊 Dashboard Deep-Dive

### 📈 Waveform Analyzer
**Detailed Operation**:
- **Sampling**: The charts render data points at the exact interval defined in your profile. For a 10ms interval, the system generates 100 points per second.
- **Interpolation**: We use **Cubic Spline** interpolation. This is critical for medical waveforms; without it, an ECG would look like a series of "stairs".
- **Cursors**: Use the vertical cursors to measure the distance between two peaks. The Δt (Delta-Time) is calculated with microsecond resolution.

![Waveform Analysis](/docs/images/v1.2/waveforms.png)

### 🔍 Logic Analyzer
**Detailed Operation**:
- **Triggering**: The analyzer automatically triggers on the first **START bit** (falling edge). It captures a window of 10-20 bits.
- **Protocol Overlay**: It overlays the binary value of each bit directly on the waveform. 
    - **START bit**: Always 0 (logic low).
    - **DATA bits**: LSB (Least Significant Bit) is usually sent first.
    - **PARITY bit**: (Optional) Used for simple error detection.
    - **STOP bits**: Always 1 (logic high).
- **Use Case**: Use this to verify that your "Bit Time" is correct. If the bit widths are inconsistent, your receiver will experience "bit-slip".

![Logic Analyzer](/docs/images/v1.2/logic.png)

### 📊 Telemetry HUD & Widgets
**Detailed Operation**:
- **Pinning Logic**: Any field identified in the **Packet Dissector** can be "pinned" to the HUD. This creates a persistent widget that remains visible globally.
- **Widget Types**:
    - **Gauge**: Best for "bounded" values like SpO2 (0-100%) or Temperature.
    - **Sparkline**: Shows the last 30 seconds of history to identify trends.
    - **Status LED**: Maps a bitfield to a color indicator.

![Telemetry HUD](/docs/images/v1.2/telemetry.png)

### 🩺 Advanced Diagnostics
**Detailed Operation**:
- **Success Rate**: Calculated as `(Total Frames - Error Frames) / Total Frames`.
- **Clean Frames**: Frames that arrived exactly on time without any jitter or checksum failures.
- **Latency Heatmap**: Visualizes the "Network Jitter".

![Diagnostics Panel](/docs/images/v1.2/diagnostics.png)

### 🎮 3D Clinical Visualizer
**Detailed Operation**:
- **Digital Twin Mapping**: Uses a **Three.js** engine to map incoming UART fields to 3D objects.
- **Interaction**: If the simulation sends a "Heart Rate" of 120, the 3D heart model's animation speed increases accordingly.

![3D Medical Scene](/docs/images/v1.2/visualizer_3d.png)

### 🎓 Interactive Learn Tab
**Detailed Operation**:
- **Interactive Lessons**: A built-in curriculum covering UART basics, framing, and signal integrity.
- **Live Experiments**: Lessons include "Try it now" buttons that automatically configure the simulator.

---

<a name="protocol-engineering"></a>
## 🛠️ Protocol Engineering

### COBS (Consistent Overhead Byte Stuffing)
**Technical Explanation**:
COBS is used to eliminate `0x00` from the data stream. It replaces every zero with a pointer to the next zero. This allows `0x00` to be used exclusively as a **Frame Delimiter**.

### Modbus RTU CRC16
**Technical Explanation**:
We use the **CRC-16-ANSI** polynomial (`0x8005`). The engine calculates this in real-time for every generated packet.

![Profile Editor](/docs/images/v1.2/profile_editor.png)

---

<a name="clinical-validation"></a>
## 🧪 Clinical Validation

### 🏥 Medical Waveform Synthesis
Our engine uses mathematical models to generate:
- **ECG (Electrocardiogram)**: P-QRS-T complex simulation with adjustable heart rate and arrhythmia patterns.
- **PPG (Plethysmogram)**: Simulates blood volume changes reflecting SpO2 levels.

### 🛡️ Compliance Engine
- **Audit Logs**: Every packet is timestamped and checked against clinical safety ranges.
- **Violation Triggers**: If a value exceeds a limit, the system can automatically trigger a "Critical Failure" event.

![Compliance Suite](/docs/images/v1.2/test_suite.png)

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

### Common Issues:
1. **Framing Errors (0xFE)**: Verify baud rate and reduce noise.
2. **Sync Loss**: Check "Sync Byte" in Profile Editor.
3. **High Jitter**: Close unused browser tabs to free up UI resources.

---

## 🏁 Conclusion
The **UART Pro Lab** is more than a simulator; it is a complete verification environment.

*Mustafa Sercan Sak — Chief Architect*
© 2026 Mustafa Sercan Sak Diagnostics
