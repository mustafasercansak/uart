# 🧪 Medikal Test ve Otomasyon Rehberi

Bu rehber, UART Simülatörünü profesyonel bir **Tıbbi Cihaz Test İstasyonu** olarak nasıl kullanacağınızı açıklar. Fiziksel bir sensörünüz olmadığında, alıcı cihazın (monitör, analizör vb.) tüm senaryolara nasıl tepki verdiğini ölçmek için otomasyon araçlarını kullanabilirsiniz.

---

## 📑 Senaryo Mantığı: "Sanal Hasta" Oluşturma

Senaryolar, belirli zamanlarda (`atMs`) gerçekleşen olaylar dizisidir. Tıbbi testlerde en çok kullanılan işlem türleri şunlardır:

### 1. Fizyolojik Değişimler (Ramp & Set)
Bir hastanın nabzının yavaşça düşmesini veya aniden yükselmesini simüle etmek için kullanılır.
- **Ramp**: Belirli bir sürede bir değerden diğerine yumuşak geçiş yapar.
    - *Örnek*: Nabzı 10 saniyede 80'den 40'a düşür (**Bradycardia** testi).
- **Set**: Anlık değer değişikliği.
    - *Örnek*: SpO2 değerini aniden %98'den %85'e çek (**Hypoxia** testi).

### 2. Hata Enjeksiyonu (Fault Injection)
Yazılımınızın hatalı veri paketlerine karşı dayanıklılığını ölçmek içindir.
- **Checksum Hatası**: Paketin doğrulama kodunu bozar. Alıcı cihazın bu paketi reddettiğini doğrulamak için kullanılır.
- **Sync Hatası**: Başlangıç byte'larını değiştirir. Cihazın "Frame Sync" kaybını nasıl yönettiğini test eder.
- **Sinyal Kaybı (Skip Bytes)**: Bazı byte'ları göndermeyerek bağlantı kopması senaryosu yaratır.

---

## 🛠 Adım Adım Senaryo Oluşturma

1.  **Profil Seçin**: Test edeceğiniz cihazın protokolünü (örn: YS2000A) üst menüden seçin.
2.  **Editöre Gidin**: Sol menüden "Senaryo Düzenleyici" sekmesine tıklayın.
3.  **Yeni Senaryo**: `+` butonuna basarak yeni bir test oluşturun.
4.  **Adım Ekle**: `+ ADIM EKLE` butonu ile olayları zaman sırasına göre dizin:
    -   `0 ms`: `field:BPM` -> `set` -> `80` (Normal Başlangıç)
    -   `5000 ms`: `field:BPM` -> `ramp` -> `150` (5 saniye sürecek bir taşikardi atağı)
    -   `15000 ms`: `inject_error` -> `corrupt_checksum` (Yüksek nabızda veri bozulması testi)
5.  **Kaydet & Çalıştır**: Senaryo otomatik kaydedilir. Dashboard'a dönüp simülasyonu bu senaryo ile başlatın.

---

## 🚨 Tetikleyiciler (Triggers) ve Alarmlar

Tetikleyiciler, veri belirli bir kurala uyduğunda (örn: `BPM > 120`) otomatik bir aksiyon alınmasını sağlar.

- **Kullanım Senaryosu**: Cihazınız bir alarm ürettiğinde (belirli bir byte set edildiğinde), simülatörün kaydı durdurmasını veya bir hata enjekte etmesini sağlayabilirsiniz.
- **Kural Yazımı**: `BPM > 100` veya `SpO2 < 90` gibi basit mantıksal ifadeler kullanabilirsiniz.

---

## ⚕️ Hazır Şablonlar (Medikal Test Suite)

Kütüphanede bulunan hazır şablonları kullanarak hızlıca test başlatabilirsiniz:
- **Arrhythmia Test**: Ritim bozukluklarını simüle eden karmaşık dalga formları.
- **Sensor Disconnect**: "Lead-Off" durumunu simüle etmek için tüm dalga formlarını sıfıra çeken ve hata flag'lerini set eden senaryo.
- **Stress Test**: Maksimum baud rate ve minimum paket aralığı ile alıcı cihazın buffer kapasitesini zorlama.

---

© 2026 Mustafa Sercan Sak - Pro Suite Diagnostic tools
