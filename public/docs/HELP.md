# UART PRO LAB - Engineering Suite Reference

Welcome to the **UART Pro Lab**, a professional-grade telemetry environment designed for high-precision embedded protocol development and physical layer simulation.

![Professional Laboratory Suite](/docs/images/hero.png)

---

## 🚀 Level 1: Smart Protocol Decoders
The Pro Lab features an advanced **Packaging Motor** that supports industry-standard framing protocols. This ensures your telemetry matches real-world hardware implementations.

### Supported Framing Modes:
- **SLIP (Serial Line IP)**: Uses `0xC0` as end-of-frame and `0xDB` as escape characters. Ideal for IP-over-Serial applications.
- **COBS (Consistent Overhead Byte Stuffing)**: Eliminates 0x00 bytes from the stream, ensuring reliable frame boundaries without using special characters.
- **Modbus RTU**: Automatically calculates and appends a **CRC16** (Cyclical Redundancy Check) to every packet for data integrity validation.

> [!TIP]
> To switch protocols, open the **Profile Editor**, go to the **Framing** tab, and select your desired packaging engine.

![Smart Decoder Interface](/docs/images/pro_decoders.png)

---

## 🔬 Level 2: Signal Integrity Lab
Simulate the harsh realities of physical communication links. The Integrity Lab allows you to test how your MCU firmware handles intermittent failures and timing drift.

### Laboratory Controls:
- **Noise Injection**: Injects random Gaussian noise into the data bytes.
- **Micro-Jitter**: Simulates variable packet arrival times (drift) to test your RX buffer synchronization.
- **Bit-Flipping**: Randomly toggles individual bits within a frame to simulate electromagnetic interference (EMI).

![Signal Integrity Calibration](/docs/images/pro_integrity.png)

---

## 🎨 Level 3: Digital Twin & Dashboard Designer
Transform raw data into a mission-control HUD using the drag-and-drop designer. Create a visual twin of your hardware device.

### How to Build Your HUD:
1. **Pinning**: In the **Packet Dissector**, click the **Pin (📌)** icon next to any field entry.
2. **Widget Selection**: Choose between **Real-time Charts**, **Analog Gauges**, **Status LEDs**, or **7-Segment Displays**.
3. **Layout**: Drag the widgets to arrange them. Your layout is automatically saved and synchronized with the backend.

![Dashboard Designer & HUD](/docs/images/pro_designer.png)

---

## ⏺ Professional Capture & Playback
- **Recording**: Capture diagnostic sessions with microsecond timestamps.
- **Time Travel**: Use the **Playback** tab to scrub through past data, analyzing exact failure points using frame-by-frame stepping.

---

## 🛡️ Level 5: Medical Certification & Compliance (v7.1)
The Pro Suite now includes an automated **Compliance Engine** for medical device verification.
- **Automated Auditing**: The system checks every UART packet against your predefined clinical safety limits.
- **Expert Reporting**: Generate high-fidelity, signature-ready PDF reports that prove your hardware's compliance with medical standards.

---

## 🛡️ Medikal Validasyon ve Sertifikasyon (v7.1)

En yeni güncelleme ile simülatör, profesyonel bir **Yeterlilik (Certification) İstasyonu**'na dönüştü.
1. **Validasyon Başlat**: Üst menüdeki kalkan ikonuna basarak bir test oturumu açın.
2. **Kriter Belirle**: Cihazınızın uyması gereken Min/Max değerleri girin.
3. **Rapor Üret**: Test sonunda, tıbbi standartlara uygun, PDF olarak kaydedilebilen profesyonel bir doğrulama raporu alın.

© 2026 Mustafa Sercan Sak — MedNet Suite Team v7.1.0
