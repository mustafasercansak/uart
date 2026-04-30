# 📜 UART Sensör Simülatörü — Değişiklik Günlüğü (CHANGELOG)

Bu dosya, UART Sensör Simülatörü'nün "Medikal Simülasyon" ve "Yeterlilik (Certification) Suite" dönüşümündeki tüm önemli kilometre taşlarını takip eder.

---

### [7.2.0] - 2026-04-30
#### ✨ Scriptable Virtual Peripheral Designer
- **Dynamic Hardware Modeling**: Kullanıcıların dahili bir JavaScript motoru kullanarak kendi sanal çevre birimlerini (peripherals) tasarlamasına ve programlamasına olanak tanıyan yeni modül eklendi.
- **Zustand State Management**: Tüm çevre birimi yönetimi, yüksek performans ve kalıcılık için `Zustand` store mimarisine taşındı.
- **Real-time Script Runner**: Gelen baytları işleyen ve özel mantığa dayalı anlık yanıtlar üreten, kum havuzu (sandboxed) mimarili script çalışma motoru.
- **Integrated Debugger**: Kod editörü, anlık state görselleştirici ve gerçek zamanlı debug konsolu içeren "Peripheral Designer" sayfası.
- **Backend Sync**: Tasarımcı arayüzü ile simülasyon motoru arasında WebSocket tabanlı gerçek zamanlı senkronizasyon (hot-reload) desteği.
- **Full i18n Support**: Peripheral Designer arayüzü İngilizce ve Türkçe dilleriyle tam uyumlu hale getirildi.

---

### [7.1.1] - 2026-04-17
#### Eklendi
- **Akıllı Jumper Hizalama (Smart Loopback Alignment)**: TX ve RX sinyalleri artık zaman tünelinde otomatik olarak eşleştiriliyor ve tek bir işlem satırı olarak gösteriliyor.
- **Faz Kayması (Phase Shift) Desteği**: Dalga formu üreticisine `phase` parametresi eklendi, böylece çok kanallı EKG (Lead-I, Lead-II) simülasyonları tıbbi gerçekliğe uygun hale getirildi.

#### İyileştirmeler
- **Raw Loopback**: Sanal konsoldaki yapay "Echo:" ön ekleri kaldırıldı, şeffaf veri döngüsü sağlandı.
- **Profil Editörü**: Dalga formları için faz ve genlik ayarlarını içeren gelişmiş yapılandırma paneli eklendi.
- **Tip Güvenliği**: `templates.ts` ve `SimulationDashboard` bileşenlerindeki kritik TypeScript hataları temizlendi.

### [7.1.0] - 2026-04-17
### ✨ Yeni Medikal Validasyon & Raporlama Modülü
- **Profesyonel PDF Raporlama**: Validasyon seansları için print-optimize, medikal standartlara uygun "Medical Device Compliance Report" desteği eklendi.
- **Seans Kayıt Mekanizması**: Test oturumu boyunca tüm ihlaller (breach) ve uyumluluk olayları zaman damgalı olarak kayıt altına alınıyor.
- **Dinamik Skorlama**: Test sonu başarı yüzdesi (Compliance Score) hesaplama algoritması eklendi.
- **Oturum Yönetimi**: Operatör adı, Cihaz ID ve model bilgileriyle kişiselleştirilmiş sertifikasyon süreci.

## [v7.0.0] — 2026-04-17
### 🛡️ Certification Engine (Yeterlilik Motoru)
- **Akıllı Uyumluluk Denetimi**: UART üzerinden gelen verilerin (BPM, SpO2, Resp vb.) belirlenen limitlerin içinde olup olmadığını saniyeler içinde denetleyen "Monitoring Engine" kuruldu.
- **Kriter Belirleme (Target Setting)**: Kullanıcının her bir field için Min/Max değerleri ve başarı kriterlerini belirleyebileceği arayüz eklendi.
- **Hata Flagleme**: Mevzuat dışı veriler için "Clinical Breach" uyarı sistemi entegre edildi.

## [v6.1.0] — 2026-04-17
### 📈 Sinyal Sadakati (Signal Fidelity) & Tanı İstasyonu
- **HUD Sparklines**: Vital kartların (HR, SpO2) içine gerçek zamanlı mini dalga formları eklendi.
- **Diagnostic Scope**: Ham UART sinyal bütünlüğünü mikrosaniye hassasiyetle izleyen osiloskop paneli eklendi.
- **Kusursuz Veri Senkronizasyonu**: 3D Digital Twin ekranı ile HUD üzerindeki numerik veriler arasındaki gecikme (per/field mismatch) tamamen giderildi.
- **Fuzzy-Matching Engine**: Alan isimlerindeki (örn: "Lead-I" vs "lead i") uyuşmazlıkları yok sayan akıllı veri eşleştirme motoru.

## [v6.0.0] — 2026-04-17
### 🏥 Medikal Digital Twin Overhaul
- **Pearl White Chassis**: 3D monitör tasarımı klinik standartlara uygun "Pearl White" kaplama ve fırçalanmış çelik detaylarla yenilendi.
- **Atmospheric Global Lighting**: Ekranın zemine ve kablolara dinamik ışık yayması (Screen Glow) sağlandı.
- **Fiziksel Konnektörler**: 3D model üzerine renk kodlu tıbbi konnektörler (Yeşil: EKG, Sarı: Resp, Turkuaz: SpO2) eklendi.
- **High-Res Monitor Texture**: Monitör ekranı scanline ve CRT efektleriyle daha gerçekçi hale getirildi.

---

## [v5.5.0] ve Öncesi
- **UART Temel Motoru**: Veri üretimi ve paketleme temelleri.
- **Level 4 Logic Analyzer**: Bit seviyesinde zamanlama analizi.
- **Hata Enjeksiyonu**: Checksum ve Framing hatası simülasyonları.
- **Senaryo Editörü**: Temel otomasyon adımları.

---

© 2026 Mustafa Sercan Sak — MedNet Suite Team
