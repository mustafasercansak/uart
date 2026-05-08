# 📜 UART Sensör Simülatörü — Değişiklik Günlüğü (CHANGELOG)

Bu dosya, UART Sensör Simülatörü'nün "Medikal Simülasyon" ve "Yeterlilik (Certification) Suite" dönüşümündeki tüm önemli kilometre taşlarını takip eder.

---

## [v1.5.4] — 2026-05-08
### 🚀 Release v1.5.4
- Yeni sürüm yayınlandı.

---

## [v1.5.0] — 2026-05-08
### 🔄 Auto-Updater, CI/CD İyileştirmeleri & Release Otomasyonu

#### ✨ Yeni Özellikler
- **Auto-Updater**: `tauri-plugin-updater` entegrasyonu — uygulama açılışta GitHub Releases'tan güncelleme kontrol eder, yeni sürüm varsa sağ altta bildirim gösterir, tek tıkla indirir ve yeniden başlatır.
- **Release Script** (`npm run release -- 1.5`): Tek komutla `package.json`, `Cargo.toml`, `tauri.conf.json`, `README.md` ve `CHANGELOG.md` versiyonlarını günceller, commit atar, tag oluşturur ve push eder.
- **Dinamik Versiyon**: Sidebar'daki versiyon numarası artık `package.json`'dan otomatik okunur — hardcoded değil.

#### 🔧 CI/CD İyileştirmeleri
- GitHub Actions Node.js 24'e yükseltildi (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`).
- Ubuntu runner `22.04` → `24.04` güncellendi.
- `actions/checkout` ve `actions/setup-node` v5'e yükseltildi.
- Tauri signing secret'ları workflow'a eklendi (`TAURI_SIGNING_PRIVATE_KEY`).

#### 🛠 Teknik Düzeltmeler
- **Vite 8 Worker Build Fix**: `esbuild ^0.28.0` bağımlılığı eklendi — Web Worker bundle'ı CI'da başarısız oluyordu.
- **Build Target**: `safari13` → `safari16` — esbuild'in desteklemediği destructuring dönüşümü kaldırıldı.
- **Rust Edition**: `Cargo.toml` edition `2024`'e güncellendi.
- `tauri-plugin-process` eklendi (updater sonrası uygulama yeniden başlatma için).

#### 📦 Bağımlılık Güncellemeleri
- Tüm npm paketleri en son sürümlere güncellendi (`esbuild`, `vite`, `vitest`, `eslint`, `react`, `uuid`, `zustand` vb.).
- Node.js minimum gereksinimi `>=24.0.0` olarak güncellendi.

---

## [v1.4.0] — 2026-05-01
### 🚀 Custom Waveform Designer & High-Density UI Overhaul
- **Custom Waveform Designer (Lab)**: 
  - Sinyalleri serbest çizim (Freehand), matematiksel ifadeler (Formula) veya tıbbi kütüphane (ECG, PPG, Resp, Square, Noise) ile tasarlama yeteneği.
  - Tasarlanan sinyalin anında UART akışına enjekte edilmesi (Real-time Injection).
- **High-Density Dashboard**: 
  - Bilgi yoğunluğunu %60 artıran profesyonel "Bento-Grid" yerleşimi.
  - 13px kompakt font hiyerarşisi ve optimize edilmiş hücre boşlukları.
- **I18n Compliance Suite**: 
  - Sistem genelinde %100 TR/EN dil desteği ve otomatik uyumluluk testleri.
- **UI/UX Refinement**:
  - Builder sekmesi dinamik alt sekme yapısına (Frame/Waveform) geçirildi.
  - Emerald & Amber vurgulu profesyonel medikal tasarım dili.

---

## [v1.3.5] — 2026-04-30
### ✨ Scriptable Virtual Peripheral Designer
- **Dynamic Hardware Modeling**: Dahili JS motoru ile kendi sanal çevre birimlerini tasarlama ve programlama modülü.
- **Zustand State Management**: Çevre birimi yönetiminin yüksek performanslı `Zustand` mimarisine taşınması.
- **Real-time Script Runner**: Gelen baytları işleyen sandboxed JS motoru.
- **Integrated Debugger**: Kod editörü ve anlık state görselleştirici içeren yeni tasarım sayfası.

---

## [v1.3.0] — 2026-04-23
### 📈 Sinyal Sadakati (Signal Fidelity) & Tanı İstasyonu
- **HUD Sparklines**: Vital kartların içine gerçek zamanlı mini dalga formları eklendi.
- **Diagnostic Scope**: Ham UART sinyal bütünlüğünü mikrosaniye hassasiyetle izleyen osiloskop paneli.
- **Fuzzy-Matching Engine**: Alan isimlerindeki uyuşmazlıkları yok sayan akıllı veri eşleştirme motoru.
- **Smart Loopback Alignment**: TX ve RX sinyallerinin zaman tünelinde otomatik eşleştirilmesi.

---

## [v1.2.0] — 2026-04-17
### 🏥 Medikal Digital Twin Overhaul & Validation
- **Medical Digital Twin**: "Pearl White" kaplama ve dinamik ışıklandırmalı 3D monitör tasarımı.
- **Compliance Reporting**: Medikal standartlara uygun print-optimize PDF raporlama desteği.
- **Yeterlilik (Certification) Suite**: BPM, SpO2 ve Resp limitlerini denetleyen gerçek zamanlı "Monitoring Engine".
- **Physical Connectors**: 3D model üzerine renk kodlu (ECG, Resp, SpO2) konnektörler eklendi.

---

## [v1.1.0] — 2026-04-10
### ⚙️ UART Core & Scenario Automation
- **Scenario Editor**: Kompleks veri akışları için olay tabanlı otomasyon sistemi.
- **Error Injection**: Checksum, Framing ve Parity hataları için simülasyon desteği.
- **Level 4 Logic Analyzer**: Bit-seviyesinde gerçek zamanlı sinyal analizi.

---

## [v1.0.0] ve Öncesi
- **UART Temel Motoru**: Veri üretimi ve paketleme temelleri.
- **Protokol Desteği**: Standart UART protokolü ve temel telemetri görselleştirme.

---

© 2026 Mustafa Sercan Sak — MedNet Suite Team
