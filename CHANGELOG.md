# 📜 UART Sensör Simülatörü — Değişiklik Günlüğü (CHANGELOG)

Bu dosya, UART Sensör Simülatörü'nün "Medikal Simülasyon" ve "Yeterlilik (Certification) Suite" dönüşümündeki tüm önemli kilometre taşlarını takip eder.

---

## [v1.5.24] — 2026-05-11
### 🚀 Release v1.5.24
- Yeni sürüm yayınlandı.

---

## [v1.5.23] — 2026-05-09
### 🚀 Release v1.5.23
- **Otomatik Güncelleme Sistemi (Auto-Updater)**: Tauri v2 altyapısı kullanılarak kesintisiz güncelleme desteği eklendi. Uygulama artık yeni sürümleri arka planda kontrol edip kullanıcıya sunabiliyor.
- **LinkedIn Entegrasyonu**: Geliştirici profili uygulama arayüzüne ve dökümantasyona resmi olarak eklendi.

---

## [v1.5.22] — 2026-05-09
### 🚀 Release v1.5.22
- Yeni sürüm yayınlandı.

---

## [v1.5.21] — 2026-05-09
### 🚀 Release v1.5.21
- Yeni sürüm yayınlandı.

---

## [v1.5.20] — 2026-05-09
### 🚀 Release v1.5.20
- Yeni sürüm yayınlandı.

---

## [v1.5.19] — 2026-05-09
### 🚀 Release v1.5.20
- **İnteraktif Yanıtlayıcı (Script Responder)**: Simülatör artık sadece veri üreten bir TX kaynağı değil, RX üzerinden gelen komutlara yanıt verebilen akıllı bir motor. `dynamic-script` kuralı ile gelen baytlar işlenip `sendString` veya `pause/stop` komutlarıyla reaksiyon gösterilebilir.
- **İki Yönlü Timeline Terminali (Quick Send)**: Timeline ekranına eklenen Hızlı Gönderim barı sayesinde simülasyon akarken anlık olarak HEX veya ASCII komutlar (Örn: `deneme`, `pause`) enjekte edilebilir.
- **UTF-8 ve Loopback Optimizasyonu**: PuTTY gibi harici terminallere gönderilen paketlerde Türkçe karakterlerin (`ı`, `ş` vb.) çökmeden sorunsuz iletilmesi için TextEncoder altyapısı kuruldu. ASCII gönderimlerde otomatik `CRLF` (Satır Sonu) desteği eklendi.
- **VCD Export Desteği**: Telemetri kayıtlarının Logic Analyzer (ör: PulseView) yazılımlarında bit bazında incelenebilmesi için IEEE 1364 VCD formatında dışa aktarım motoru eklendi.
- **CSV Data Science Dışa Aktarımı**: Geliştiriciler ve veri bilimciler için telemetri kayıtlarının Excel ve Python tabanlı araçlarda kolayca açılabilmesi için "CSV Formatında Kaydet" (FileSpreadsheet) özelliği eklendi.
- **ASCII Metin Aktarımı**: NMEA 0183 gibi metin tabanlı profillerde PuTTY vb. programlarda verilerin okunabilmesi için sinyal jeneratörüne `isAscii` desteği eklendi.
- **İkon ve Çeviri Onarımları**: Windows'ta desteklenmeyen yeni nesil emojiler standart sembollerle (💓, ⚕️) değiştirildi ve eksik dil anahtarları onarıldı.
- **Tauri Yönlendirme Optimizasyonu**: Uygulama içi sekme yönlendirmeleri `window.open` yerine React Router `navigate` kullanılarak stabilize edildi.

---

## [v1.5.18] — 2026-05-09
### 🚀 Release v1.5.18
- Yeni sürüm yayınlandı.

---

## [v1.5.17] — 2026-05-09
### 🚀 Release v1.5.17
- Yeni sürüm yayınlandı.

---

## [v1.5.16] — 2026-05-09
### 🚀 Release v1.5.16
- Yeni sürüm yayınlandı.

---

## [v1.5.15] — 2026-05-09
### 🚀 Release v1.5.15
- Yeni sürüm yayınlandı.

---

## [v1.5.14] — 2026-05-09
### 🚀 Release v1.5.14
- Yeni sürüm yayınlandı.

---

## [v1.5.13] — 2026-05-09
### 🚀 Release v1.5.13
- Yeni sürüm yayınlandı.

---

## [v1.5.12] — 2026-05-09
### 🚀 Release v1.5.12
- Yeni sürüm yayınlandı.

---

## [v1.5.11] — 2026-05-09
### 🚀 Release v1.5.11
- Yeni sürüm yayınlandı.

---

## [v1.5.10] — 2026-05-09
### 🚀 Release v1.5.10
- Yeni sürüm yayınlandı.

---

## [v1.5.9] — 2026-05-09
### 🚀 Release v1.5.9
- Yeni sürüm yayınlandı.

---

## [v1.5.8] — 2026-05-08
### 🚀 Release v1.5.8
- Yeni sürüm yayınlandı.

---

## [v1.5.7] — 2026-05-08
### 🚀 Release v1.5.7
- Yeni sürüm yayınlandı.

---

## [v1.5.6] — 2026-05-08
### 🚀 Release v1.5.6
- Yeni sürüm yayınlandı.

---

## [v1.5.5] — 2026-05-08
### 🚀 Release v1.5.5
- Yeni sürüm yayınlandı.

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
