# UART Simulation Tool - HELP & Reference

The UART Telemetry Dashboard is a real-time simulator for generating and analyzing serial data protocols for embedded research and development.

![Active Simulation Dashboard](/docs/images/dashboard.png)

## 🏁 Quick Overview
- **What it does**: Simulates sensor profiles (Medical, Industrial, Custom) and streams them to virtual or physical COM ports.
- **Why use it**: To test your microcontroller (STM32, Arduino, ESP32) or PC telemetry software with high-fidelity "live" data without physical sensors.

---

## ⏺ Record & Playback
Capture any session using the **REC** button. Replay it with millisecond precision from the **Playback** tab.
- **Step Navigation**: Use `<` and `>` to analyze data frame-by-frame.
- **Visual Seek**: Drag the slider to any point in time.

![Playback Interface](/docs/images/playback.png)

---

## 🌡 Diagnostics
Monitor the "health" of your simulation and hardware link.
- **Inter-packet Timing**: See if packets arrive exactly when they should.
- **Jitter Monitoring**: Analyze timing drift.

![Diagnostics Panel](/docs/images/diagnostics.png)

---

## 🛠 Advanced Manual Overrides
Use the right-side panels to inject errors or change values on the fly:
- **Fault Injection**: Force checksum errors or sync mismatches.
- **Field Overrides**: Change SpO2/BPM/Temperature values via sliders without stopping the simulation.

---

## 🔬 Level 4: Hardware Logic Analyzer
For deep hardware troubleshooting, the Pro Suite includes a high-performance **Bit-Level Logic Analyzer**.
- **Timing Precision:** Microsecond (µs) level transition tracking.
- **Measurement Cursors:** Drag A and B cursors to measure exact timing (ΔT) and frequency between bit transitions.
- **Protocol Decoding:** Dedicated hardware traces for UART TX with START, DATA, and STOP bit labels.

![Logic Analyzer Diagnostics](/docs/images/pro_logic.png)

---

Developed by **Mustafa Sercan Sak**
 

