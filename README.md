# 🩺 Professional UART Sensor Simulator & Telemetry Dashboard v1.4.0

A high-performance, real-time UART telemetry platform designed for **embedded engineers** and **medical device developers**. Simulate complex sensor data (ECG, SpO₂, RESP, etc.) and stream it directly to your hardware via the **Web Serial API**.

![UART Simulator Live Dashboard](public/docs/images/dashboard.png)

---

## 🚀 Key Features (v1.4.0)

### 🎨 Custom Waveform Designer
Go beyond static signals. **Draw** your own waveforms by hand, generate them with **Math Formulas**, or use our **Clinical Preset Library** (ECG, PPG, Resp). Inject these custom signals directly into your UART stream in real-time.

### 📐 High-Density Bento Dashboard
A professional-grade interface designed for maximum information density. Monitor telemetry, high-resolution waveforms, and logic analysis on a single compact screen without scrolling.

### 🧪 Error Injection & Lab Modules
- **Jitter & Noise**: Simulate real-world signal degradation.
- **Protocol Diff**: Bit-level comparison of UART packets for reverse engineering.
- **Logic Analyzer**: Bit-by-bit visual protocol decoding.

### 📜 Validation & Reporting
Generate print-ready **Medical Device Compliance Reports** in PDF format, documenting every session, violation, and compliance score for regulatory proof.

### 🌍 Full i18n Support
Complete **English** and **Turkish** localization with a built-in compliance test suite.

---

## 🏃 Quick Start
1. **Install**: `npm install`
2. **Server**: `npm run server`
3. **Frontend**: `npm run dev`
4. **Action**: Open [http://localhost:5173](http://localhost:5173), select a profile, and hit **"Start Simulation"**.

---

## 📖 Documentation
- [Ana Mühendislik Kılavuzu (Turkish)](public/docs/GUIDE_TR.md) - Kapsamlı teknik rehber.
- [Master Engineering Manual (English)](public/docs/GUIDE_EN.md) - Comprehensive technical reference.
- [Changelog](CHANGELOG.md) - Version history and milestones.

---

Developed by **Mustafa Sercan Sak**  
© 2026 Mustafa Sercan Sak Diagnostics
