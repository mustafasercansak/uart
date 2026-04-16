# 🩺 Professional UART Sensor Simulator & Telemetry Dashboard

A high-performance, real-time UART telemetry platform designed for **embedded engineers** and **medical device developers**. Simulate complex sensor data (ECG, SpO₂, DS18B20, etc.) and stream it directly to your hardware via the **Web Serial API**.

![UART Simulator Live Dashboard](/docs/images/dashboard.png)

## 🌟 What can you do with this?
Instead of carrying physical sensors, you can:
1. **Simulate Live Hardware**: Select a profile (e.g., YS2000A Medical Monitor).
2. **Stream to COM Port**: Connect to your STM32/Arduino/PC software via any serial port.
3. **Inject Errors**: Force checksum fails, dropped bytes, or sync errors to test your receiver's robustness.
4. **Record & Playback**: Capture real scenarios and replay them later frame-by-frame.

## 🚀 Quick Start
1. **Clone & Install**: `npm install`
2. **Run Server**: `npm run server`
3. **Launch UI**: `npm run dev`
4. **Action**: Open [http://localhost:5173](http://localhost:5173), select a profile, and hit **"Start"**.

## 📖 Documentation
- [KULLANIM KILAVUZU (Turkish)](KULLANIM_KILAVUZU.md) - Detailed guide.
- [HELP (English)](HELP.md) - Technical reference.

---
Developed by **Mustafa Sercan Sak**
 

