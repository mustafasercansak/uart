# 📜 UART Sensör Simülatörü — Değişiklik Günlüğü (CHANGELOG)

Bu dosya, UART Sensör Simülatörü'nün "Medikal Simülasyon" ve "Yeterlilik (Certification) Suite" dönüşümündeki tüm önemli kilometre taşlarını takip eder.

---

## [v1.2.0] — 2026-04-29
### 🌐 Tam Yerelleştirme & Mühendislik Portalı
- **Eksiksiz Internationalization (I18n)**: Tüm çekirdek modüllerde (Tanılama, Lojik Analizör, RX Monitör) %100 İngilizce ve Türkçe desteği sağlandı.
- **Ana Mühendislik Kılavuzları**: Sinyal teorisi, sistem mimarisi ve klinik mantığı kapsayan, her iki dilde ayrı ayrı hazırlanmış derinlemesine teknik dökümantasyon (GUIDE_EN.md & GUIDE_TR.md).
- **Gelişmiş Yardım Portalı**: HTML anchor desteği, yüksek çözünürlüklü ekran görüntüleri ve dile duyarlı içerik yükleme özelliklerine sahip profesyonel dökümantasyon arşivi.
- **Altyapı Optimizasyonu**: Dağınık döküman dosyaları tek bir otorite kaynağında birleştirildi, proje yapısı paylaşım için standardize edildi.
- **Hata Düzeltmeleri**: `react-markdown` üzerinde HTML render sorunları giderildi ve sertifikasyon testlerindeki dil uyuşmazlıkları çözüldü.

---

## [v1.1.0] — 2026-04-17
### ✨ Yeni Medikal Validasyon & Raporlama Modülü
- **Profesyonel PDF Raporlama**: Validasyon seansları için print-optimize, medikal standartlara uygun "Medical Device Compliance Report" desteği eklendi.
- **Seans Kayıt Mekanizması**: Test oturumu boyunca tüm ihlaller (breach) ve uyumluluk olayları zaman damgalı olarak kayıt altına alınıyor.
- **Dinamik Skorlama**: Test sonu başarı yüzdesi (Compliance Score) hesaplama algoritması eklendi.
- **Oturum Yönetimi**: Operatör adı, Cihaz ID ve model bilgileriyle kişiselleştirilmiş sertifikasyon süreci.

---

## [v1.0.5] — 2026-04-17
### 🛡️ Certification Engine (Yeterlilik Motoru)
- **Akıllı Uyumluluk Denetimi**: UART üzerinden gelen verilerin (BPM, SpO2, Resp vb.) belirlenen limitlerin içinde olup olmadığını saniyeler içinde denetleyen "Monitoring Engine" kuruldu.
- **Kriter Belirleme (Target Setting)**: Kullanıcının her bir field için Min/Max değerleri ve başarı kriterlerini belirleyebileceği arayüz eklendi.
- **Hata Flagleme**: Mevzuat dışı veriler için "Clinical Breach" uyarı sistemi entegre edildi.

---

## [v1.0.1] — 2026-04-17
### 📈 Sinyal Sadakati (Signal Fidelity) & Tanı İstasyonu
- **HUD Sparklines**: Vital kartların (HR, SpO2) içine gerçek zamanlı mini dalga formları eklendi.
- **Diagnostic Scope**: Ham UART sinyal bütünlüğünü mikrosaniye hassasiyetle izleyen osiloskop paneli eklendi.
- **Kusursuz Veri Senkronizasyonu**: 3D Digital Twin ekranı ile HUD üzerindeki numerik veriler arasındaki gecikme (per/field mismatch) tamamen giderildi.
- **Fuzzy-Matching Engine**: Alan isimlerindeki (örn: "Lead-I" vs "lead i") uyuşmazlıkları yok sayan akıllı veri eşleştirme motoru.

---

## [v1.0.0] — 2026-04-17
### 🏥 Medikal Digital Twin Overhaul
- **Pearl White Chassis**: 3D monitör tasarımı klinik standartlara uygun "Pearl White" kaplama ve fırçalanmış çelik detaylarla yenilendi.
- **Atmospheric Global Lighting**: Ekranın zemine ve kablolara dinamik ışık yayması (Screen Glow) sağlandı.
- **Fiziksel Konnektörler**: 3D model üzerine renk kodlu tıbbi konnektörler (Yeşil: EKG, Sarı: Resp, Turkuaz: SpO2) eklendi.
- **High-Res Monitor Texture**: Monitör ekranı scanline ve CRT efektleriyle daha gerçekçi hale getirildi.

---

© 2026 Mustafa Sercan Sak — MedNet Suite Team
