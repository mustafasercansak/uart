# 🔬 UART PRO LAB — Ana Mühendislik Kılavuzu
## Profesyonel Simülasyon, Tanılama ve Doğrulama Paketi v1.3.0

**UART Pro Lab Ana Kılavuzu**'na hoş geldiniz. Bu belge, en gelişmiş UART simülasyon ortamı için kapsamlı bir teknik ve operasyonel kılavuz sağlar.

---

## 📑 İçindekiler
1. [🏗️ Sistem Mimarisi](#architecture)
2. [📡 Sinyal Bütünlüğü Teorisi](#signal-integrity)
3. [📊 Panel Detayları (Deep-Dive)](#dashboard-details)
4. [🔬 Gelişmiş Laboratuvar Modülleri](#advanced-lab)
5. [📈 DSP ve Spektral Analiz](#dsp-analysis)
6. [📋 Yapılandırma ve Şablonlar](#config-templates)
7. [📄 Doğrulama ve Raporlama](#validation-reporting)
8. [🛠️ Protokol Mühendisliği](#protocol-engineering)
9. [🧪 Klinik Doğrulama](#clinical-validation)
10. [🤖 Otomasyon ve Betikleme](#automation)
11. [🎞️ Oturum Yönetimi](#session-management)
12. [🛠️ Sorun Giderme ve Optimizasyon](#troubleshooting)

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

![Dalga Formu Analizi](/docs/images/v1.2/waveforms_live.png)

### 🔍 Lojik Analizör
**Detaylı Çalışma**:
- **Tetikleme**: Analizör ilk **START bitinde** (düşen kenar) otomatik olarak tetiklenir. Kare boyutunuza bağlı olarak 10-20 bitlik bir pencere yakalar.
- **Protokol Katmanı**: Her bitin ikili değerini doğrudan dalga formu üzerine bindirir.
    - **START biti**: Her zaman 0 (lojik düşük).
    - **VERİ bitleri**: Genellikle önce LSB (En Önemsiz Bit) gönderilir.
    - **PARITY biti**: (Opsiyonel) Basit hata tespiti için kullanılır.
    - **STOP bitleri**: Her zaman 1 (lojik yüksek).
- **Kullanım Durumu**: "Bit Sürenizin" (1 / Baud Rate) mikrosaniye hassasiyetinde doğru olduğunu doğrulamak için bunu kullanın.

![Lojik Analizör](/docs/images/v1.2/logic_live.png)

### 📊 Telemetri HUD ve Widget'lar
**Detaylı Çalışma**:
- **İğneleme Mantığı**: **Paket Ayrıştırıcıda** tanımlanan herhangi bir alan HUD'a "iğnelenebilir". Bu, hangi sekmede olursanız olun görünür kalan kalıcı bir widget oluşturur.
- **Widget Türleri**:
    - **Gauge (Kadran)**: SpO2 (%0-100) veya Sıcaklık gibi "sınırlı" değerler için en iyisidir.
    - **Sparkline**: Eğilimleri belirlemek için son 30 saniyelik geçmişi gösterir.
    - **Durum LED'i**: Bir bit alanını bir renk göstergesine eşler.

![Telemetri Paneli](/docs/images/v1.2/telemetry_live.png)

### 🩺 Gelişmiş Tanılama (Diagnostics)
**Detaylı Çalışma**:
- **Başarı Oranı**: `(Toplam Kare - Hata Karesi) / Toplam Kare` olarak hesaplanır. Kritik bir sistemde bu oran %99.9+ seviyesinde kalmalıdır.
- **Temiz Kareler**: Jitter veya checksum hatası olmadan tam zamanında gelen kareler.

![Tanılama Paneli](/docs/images/v1.2/diagnostics_live.png)

### 🎮 3D Klinik Görselleştirici
**Detaylı Çalışma**:
- **Dijital İkiz Eşleme**: Gelen UART alanlarını 3D nesnelere eşlemek için bir **Three.js** motoru kullanır.
- **Etkileşim**: Simülasyon 120 "Nabız" gönderirse, 3D kalp modelinin animasyon hızı buna göre artar.

![3D Tıbbi Sahne](/docs/images/v1.2/visualizer_live.png)

---

<a name="config-templates"></a>
## 📋 Yapılandırma ve Şablonlar

### 🛠️ Profil Şablon Düzenleyici (Profile Editor)
**Detaylı Çalışma**:
- **Görsel Ayrıştırıcı**: Kod yazmadan UART paketlerinizin yapısını tanımlayın. Başlangıç baytlarını, alan uzunluklarını ve veri tiplerini (Integer, Float, Bitmask) ayarlayın.
- **Şablon Kütüphanesi**: Farklı cihaz protokollerini (örn: Hasta Monitörü v1, EKG Modülü x2) kaydedin ve aralarında anında geçiş yapın.
- **Güvenli Aralık Eşleme**: Otomatik uyumluluk izlemeyi etkinleştirmek için her alan için "Yeşil Bölge" (Güvenli Aralık) tanımlayın.

![Profil Düzenleyici](/docs/images/v1.2/profile_editor_live.png)

### 🎭 Simülasyon Senaryoları
**Detaylı Çalışma**:
- **Davranış Enjeksiyonu**: Simülasyonu anında "Stabil" durumdan "Acil Durum"a (örn: Taşikardi, Hipoksi) geçirin.
- **Betiklenmiş Olaylar**: Senaryolar, sisteminizin alarm mantığını test etmek için tanımlanan aralıklarla belirli alan geçersiz kılmalarını (overrides) tetikleyebilir.

![Senaryolar](/docs/images/v1.2/scenarios_live.png)

---

<a name="validation-reporting"></a>
## 📄 Doğrulama ve Raporlama

### 📜 Doğrulama Raporu (PDF Dışa Aktarma)
**Detaylı Çalışma**:
- **Uyumluluk Puanlaması**: Oturumun süresine ve tespit edilen ihlal sayısına göre otomatik olarak bir "Sağlık Puanı" hesaplar.
- **Kanıt Günlüğü**: Her ihlali yüksek çözünürlüklü zaman damgası ve buna neden olan ham (raw) veri ile birlikte yakalar.
- **Oturum Üstverileri**: Düzenlemeye tabi ortamlarda tam izlenebilirlik için Cihaz Kimliği, Operatör Adı ve Ortam İstatistiklerini takip eder.

![Doğrulama Raporu](/docs/images/v1.2/report_live.png)

---

<a name="advanced-lab"></a>
## 🔬 Gelişmiş Laboratuvar Modülleri

### 🧪 Diferansiyel Analiz (Lab Diff)
**Detaylı Çalışma**:
- **Bit Seviyesinde Karşılaştırma**: Geçmişteki herhangi iki kareyi seçerek "diff" işlemi yapın. Sistem hangi bitlerin değiştiğini tam olarak vurgular.
- **Protokol Keşfi**: Sadece birkaç bitin sensör girişine bağlı olarak değiştiği bilinmeyen UART protokollerini tersine mühendislik (reverse-engineering) ile çözmek için temeldir.

![Lab Diff](/docs/images/v1.2/lab_diff_live.png)

### 📜 İletişim Zaman Çizelgesi (Timeline)
**Detaylı Çalışma**:
- **Dizi Denetimi**: Tüm TX ve RX olaylarının dikey bir akışı.
- **Gecikme Takibi**: Bir istek (TX) ile karşılık gelen yanıt (RX) arasındaki süreyi otomatik olarak hesaplar.

![Timeline](/docs/images/v1.2/timeline_live.png)

### 🔌 Donanım Yerleşim Görselleştirici
**Detaylı Çalışma**:
- **IO İzleme**: MCU'nun (UART-X1) sanal bir temsili.
- **Canlı Pinler**: Veri paketleri işlendikçe TX ve RX pinleri gerçek zamanlı olarak parlar ve fiziksel katman etkinliğinin görsel onayını sağlar.

![Donanım Görselleştirici](/docs/images/v1.2/hardware_live.png)

---

<a name="dsp-analysis"></a>
## 📈 DSP ve Spektral Analiz

### 📊 FFT Spektrum Analizörü
**Detaylı Çalışma**:
- **Dönüşüm**: Zaman düzlemindeki dalga formu verilerini **Hızlı Fourier Dönüşümü (FFT)** kullanarak frekans düzlemine dönüştürür.
- **Pencereleme Fonksiyonları**:
    - **Hanning**: Genel amaçlı frekans çözünürlüğü için en iyisidir.
    - **Hamming**: Kenarlardaki "sızıntıyı" en aza indirmek için optimize edilmiştir.
    - **Rectangular**: En yüksek frekans çözünürlüğü sağlar ancak spektral sızıntıya eğilimlidir.
- **Kullanım Durumu**: Simüle edilen sinyallerinizdeki periyodik gürültüyü, güç hattı parazitini (50/60Hz) veya harmonik bozulmaları belirleyin.

![Spektral Analiz](/docs/images/v1.2/spectrum_live.png)

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

![Sertifikasyon Testleri](/docs/images/v1.2/testing_live.png)

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
