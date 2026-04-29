# 🔬 UART PRO LAB — Ana Mühendislik Kılavuzu
## Profesyonel Simülasyon, Tanılama ve Doğrulama Paketi v1.2.0

**UART Pro Lab Ana Kılavuzu**'na hoş geldiniz. Bu belge, en gelişmiş UART simülasyon ortamı için kapsamlı bir teknik ve operasyonel kılavuz sağlar.

---

## 📑 İçindekiler
1. [🏗️ Sistem Mimarisi](#architecture)
2. [📡 Sinyal Bütünlüğü Teorisi](#signal-integrity)
3. [📊 Panel Detayları (Deep-Dive)](#dashboard-details)
4. [🛠️ Protokol Mühendisliği](#protocol-engineering)
5. [🧪 Klinik Doğrulama](#clinical-validation)
6. [🤖 Otomasyon ve Betikleme](#automation)
7. [🛠️ Sorun Giderme ve Optimizasyon](#troubleshooting)

---

<a name="architecture"></a>
## 🏗️ Sistem Mimarisi

UART Pro Lab, **Yüksek Eşzamanlı Gerçek Zamanlı Motor** üzerine kurulmuştur. Basit döngülere dayanan standart simülatörlerin aksine, motorumuz veri üretiminin UI thread'inden bağımsız olmasını sağlamak için **Node.js Worker Thread** mimarisini kullanır.
- **Hassas Zamanlama**: Yüksek hızlı baud rate'leri (921.600 bps'ye kadar) jitter olmadan simüle etmek için gerekli olan nanosaniye hassasiyetindeki aralıklar için `process.hrtime()` kullanıyoruz.
- **Sıfır-Kopya Tamponlar**: Gecikmeyi en aza indirmek için motor ve arayüz arasında veri aktarımı paylaşılan bellek veya yüksek hızlı WebSocket'ler kullanılarak yapılır.

![Sistem Paneli](/docs/images/v1.2/dashboard_tr.png)

---

<a name="signal-integrity"></a>
## 📡 Sinyal Bütünlüğü Teorisi

"Mükemmel" bir UART hattını simüle etmek kolaydır, ancak gerçek dünya donanımı karmaşıktır. **Bütünlük Laboratuvarı (Integrity Lab)**, fiziksel katman bozulmalarını simüle etmenize olanak tanır.

### 1. Gaussian Gürültü Enjeksiyonu
- **Teori**: Simüle edilen sinyale rastgele voltaj dalgalanmaları ekleriz. Bu, alıcınızın karşılaştırıcı (comparator) mantığının "bulanık" bitleri nasıl yönettiğini test eder.
- **Etki**: Yüksek gürültü seviyeleri, MCU'nuzda **Çerçeveleme Hatalarını (Framing Errors)** veya yanlış bit tespitini tetikleyecektir.

### 2. Mikro-Jitter (Zamanlama Kayması)
- **Teori**: Gerçek sistemlerde paketler arası süre sabit değildir. Jitter, göndericideki CPU çizelgelemesi veya kesme (interrupt) gecikmesinin neden olduğu kaymayı simüle eder.
- **Etki**: RX Tamponunuzun (buffer) taşma olmadan kesintili trafiği yönetme yeteneğini test eder.

### 3. Bit-Flipping / BER (Bit Hata Oranı)
- **Teori**: Elektromanyetik Paraziti (EMI) simüle eder. Rastgele bir biti 0'dan 1'e (veya tersi) çeviririz.
- **Etki**: **Sağlama Toplamı (Checksum/CRC)** sağlamlığını test etmek için temeldir. Kodunuz ters dönmüş bir biti yakalayamazsa, tıbbi verileriniz tehlikeye girer.

---

<a name="dashboard-details"></a>
## 📊 Panel Detayları (Deep-Dive)

### 📈 Dalga Formu Analizörü
**Detaylı Çalışma**:
- **Örnekleme**: Grafikler, profilinizde tanımlanan tam aralıkta veri noktalarını işler. 10ms'lik bir aralık için sistem saniyede 100 nokta üretir.
- **İnterpolasyon**: **Cubic Spline** interpolasyonu kullanıyoruz. Bu, tıbbi dalga formları için kritiktir; o olmadan bir EKG "merdiven" dizisi gibi görünürdü.
- **İmleçler**: İki tepe noktası arasındaki mesafeyi ölçmek için dikey imleçleri kullanın. Δt (Delta-Zaman) mikrosaniye çözünürlüğüyle hesaplanır.

![Dalga Formu Analizi](/docs/images/v1.2/waveforms.png)

### 🔍 Lojik Analizör
**Detaylı Çalışma**:
- **Tetikleme**: Analizör ilk **START bitinde** (düşen kenar) otomatik olarak tetiklenir. Kare boyutunuza bağlı olarak 10-20 bitlik bir pencere yakalar.
- **Protokol Katmanı**: Her bitin ikili değerini doğrudan dalga formu üzerine bindirir.
    - **START biti**: Her zaman 0 (lojik düşük).
    - **VERİ bitleri**: Genellikle önce LSB (En Önemsiz Bit) gönderilir.
    - **PARITY biti**: (Opsiyonel) Basit hata tespiti için kullanılır.
    - **STOP bitleri**: Her zaman 1 (lojik yüksek).
- **Kullanım Durumu**: "Bit Sürenizin" (1 / Baud Rate) mikrosaniye hassasiyetinde doğru olduğunu doğrulamak için bunu kullanın.

![Lojik Analizör](/docs/images/v1.2/logic.png)

### 📊 Telemetri HUD ve Widget'lar
**Detaylı Çalışma**:
- **İğneleme Mantığı**: **Paket Ayrıştırıcıda** tanımlanan herhangi bir alan HUD'a "iğnelenebilir". Bu, hangi sekmede olursanız olun görünür kalan kalıcı bir widget oluşturur.
- **Widget Türleri**:
    - **Gauge (Kadran)**: SpO2 (%0-100) veya Sıcaklık gibi "sınırlı" değerler için en iyisidir.
    - **Sparkline**: Eğilimleri belirlemek için son 30 saniyelik geçmişi gösterir.
    - **Durum LED'i**: Bir bit alanını bir renk göstergesine eşler.

![Telemetri Paneli](/docs/images/v1.2/telemetry.png)

### 🩺 Gelişmiş Tanılama (Diagnostics)
**Detaylı Çalışma**:
- **Başarı Oranı**: `(Toplam Kare - Hata Karesi) / Toplam Kare` olarak hesaplanır. Kritik bir sistemde bu oran %99.9+ seviyesinde kalmalıdır.
- **Temiz Kareler**: Jitter veya checksum hatası olmadan tam zamanında gelen kareler.

![Tanılama Paneli](/docs/images/v1.2/diagnostics.png)

### 🎮 3D Klinik Görselleştirici
**Detaylı Çalışma**:
- **Dijital İkiz Eşleme**: Gelen UART alanlarını 3D nesnelere eşlemek için bir **Three.js** motoru kullanır.
- **Etkileşim**: Simülasyon 120 "Nabız" gönderirse, 3D kalp modelinin animasyon hızı buna göre artar.

![3D Tıbbi Sahne](/docs/images/v1.2/visualizer_3d.png)

---

<a name="protocol-engineering"></a>
## 🛠️ Protokol Mühendisliği

### COBS (Consistent Overhead Byte Stuffing)
**Teknik Açıklama**:
COBS, veri akışından `0x00` değerini kaldırmak için kullanılır. Her sıfırı bir sonraki sıfıra olan bir işaretçi ile değiştirir. Bu, `0x00`'ın münhasıran bir **Çerçeve Sınırlayıcı (Frame Delimiter)** olarak kullanılmasına olanak tanır.

### Modbus RTU CRC16
**Teknik Açıklama**:
**CRC-16-ANSI** polinomunu (`0x8005`) kullanıyoruz. Motor bunu üretilen her paket için gerçek zamanlı olarak hesaplar.

![Profil Düzenleyici](/docs/images/v1.2/profile_editor.png)

---

<a name="clinical-validation"></a>
## 🧪 Klinik Doğrulama

### 🏥 Tıbbi Dalga Formu Sentezi
Motorumuz şu formları oluşturmak için matematiksel modeller kullanır:
- **EKG (Elektrokardiyogram)**: Ayarlanabilir kalp hızı ve aritmi modelleri ile P-QRS-T kompleksi simülasyonu.
- **PPG (Pletismogram)**: SpO2 seviyelerini yansıtan kan hacmi değişikliklerini simüle eder.

### 🛡️ Uyumluluk Motoru (Compliance)
- **Denetim Günlükleri**: Her paket zaman damgalıdır ve klinik güvenlik aralıklarına göre kontrol edilir.
- **İhlal Tetikleyicileri**: Bir değer sınırı aşarsa (örn: SpO2 < 85), sistem otomatik olarak bir "Kritik Hata" olayı tetikleyebilir.

![Sertifikasyon Testleri](/docs/images/v1.2/test_suite.png)

---

<a name="automation"></a>
## 🤖 Otomasyon ve Betikleme

### Dinamik Yanıtlayıcı Betikleme (Scripting)
Etkileşimli bir "Dijital İkiz" oluşturmak için JavaScript yazabilirsiniz.
```javascript
onReceive((data) => {
  if (data[0] === 0x05) {
    send([0xAA, 0x05, batteryLevel, 0xFF]);
  }
});
```

---

<a name="troubleshooting"></a>
## 🛠️ Sorun Giderme ve Optimizasyon

### Yaygın Sorunlar:
1. **Çerçeveleme Hataları (0xFE)**: Baud hızını doğrulayın ve gürültüyü azaltın.
2. **Sync Kaybı**: Profil Editörü'ndeki "Sync Byte"ı kontrol edin.
3. **Yüksek Jitter**: UI kaynaklarını boşaltmak için kullanılmayan tarayıcı sekmelerini kapatın.

---

## 🏁 Sonuç
**UART Pro Lab**, bir simülatörden daha fazlasıdır; tam bir doğrulama ortamıdır.

*Mustafa Sercan Sak — Baş Mimar*
© 2026 Mustafa Sercan Sak Diagnostics
