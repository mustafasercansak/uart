# UART PRO LAB — Ana Mühendislik Kılavuzu
## Profesyonel Simülasyon, Tanılama ve Doğrulama Paketi · v1.4.0

> **UART Pro Lab**, hassasiyet gerektiren gömülü sistem mühendisleri, tıbbi cihaz geliştiricileri ve protokol araştırmacıları için tasarlanmış dünyanın en gelişmiş tarayıcı tabanlı UART simülasyon ve doğrulama ortamıdır.

![UART Pro Lab Hero](images/hero.png)

---

## İçindekiler

1. [Başlarken](#getting-started)
2. [Sistem Mimarisi](#architecture)
3. [Panel Genel Bakış](#dashboard)
4. [Telemetri ve Canlı Metrikler](#telemetry)
5. [Özel Dalga Formu Tasarımcısı](#waveform-designer)
6. [Sinyal Bütünlüğü Laboratuvarı](#signal-integrity)
7. [Gelişmiş Laboratuvar Modülleri](#advanced-lab)
8. [Mantık Analizörü](#logic-analyzer)
9. [DSP ve Spektral Analiz](#dsp-analysis)
10. [Donanım Simülasyonu](#hardware)
11. [Profil Şablonu Düzenleyici](#profile-editor)
12. [Senaryo Motoru ve Test](#scenarios)
13. [Otomasyon ve Betikleme](#automation)
14. [3D Görselleştirici](#visualizer)
15. [Oturum Yönetimi ve Geri Oynatma](#session)
16. [Doğrulama ve Raporlama](#reporting)
17. [Klavye Kısayolları](#shortcuts)
18. [Sorun Giderme ve Optimizasyon](#troubleshooting)
19. [Sözlük](#glossary)

---

<a name="getting-started"></a>
## 1. Başlarken

### Sistem Gereksinimleri
| Gereksinim | Minimum | Önerilen |
|---|---|---|
| Tarayıcı | Chrome 110+ / Edge 110+ | Chrome 120+ |
| RAM | 4 GB | 16 GB |
| CPU | Çift çekirdek 2 GHz | Sekiz çekirdek 3 GHz |
| Ekran | 1280×720 | 2560×1440 |
| GPU | Entegre | Harici (WebGL 2.0) |

### İlk Başlatma
1. Uygulamayı açın — **Simülasyon Paneli** otomatik yüklenir.
2. Sol üst köşedeki profil seçiciden bir **Sensör Profili** seçin.
3. Yapılandırma Paneli'nden **Baud Hızı**, **Veri Bitleri**, **Eşlik** ve **Stop Bitleri** ayarlarını yapın.
4. **▶ Başlat** butonuna basarak canlı simülasyonu başlatın.
5. Gerçek zamanlı dalga formlarını, telemetriyi ve çözülmüş paketleri anında izleyin.

### Hızlı Profil Rehberi
- **IMU (MPU-6050)**: 9 eksenli atalet ölçüm birimi — ivmeölçer + jiroskop + sıcaklık.
- **EKG (ADS1292)**: 500 Hz tıbbi örnekleme hızında 2 kanallı kardiyak sinyal.
- **GPS (NMEA-0183)**: GPRMC, GPGGA cümle akışları.
- **Çevresel (BME280)**: Sıcaklık, nem, basınç kombine çerçeve.
- **Özel**: Profil Düzenleyici'de kendi paket yapınızı tanımlayın.

---

<a name="architecture"></a>
## 2. Sistem Mimarisi

UART Pro Lab tamamen tarayıcıda çalışır — **sıfır sunucu bağımlılığı**. Tüm hesaplama, katmanlı bir mimari kullanarak istemci tarafında gerçekleşir:

```
┌─────────────────────────────────────┐
│         React UI Katmanı            │  ← Vite + React 19, Zustand state
├─────────────────────────────────────┤
│       Web Worker Motoru             │  ← simulation.worker.ts (ayrı thread)
├─────────────────────────────────────┤
│    Sinyal İşleme Çekirdeği          │  ← FFT, interpolasyon, bütünlük kontrolü
├─────────────────────────────────────┤
│     Donanım Soyutlama Katmanı       │  ← Sanal seri port emülasyonu
└─────────────────────────────────────┘
```

### Temel Mimari Kararlar

**Web Worker Motoru**: Simülasyon motoru (`simulation.worker.ts`), UI'dan tamamen izole edilmiş ayrı bir tarayıcı thread'inde çalışır. Bu sayede tam FFT analiziyle birlikte 921600 baud simülasyonu bile UI'da kasılmaya yol açmaz. Worker çökerse otomatik olarak yeniden başlatılır (en fazla 5 kez) ve oturumu kaldığı yerden devam ettirir.

**Durum Mimarisi**: Yüksek frekanslı veriler (dalga formu geçmişi, ham bayt akışı) gereksiz yeniden render'ları önlemek için React state dışında `useRef` içinde saklanır. Yalnızca toplu metrikler React durum ağacından akar.

**Sunucu Yok**: Tüm sensör profilleri, oturumlar ve yapılandırmalar `localStorage` / `IndexedDB`'de saklanır. Hiçbir şey makinenizden çıkmaz.

![Sistem Paneli](images/v1.2/dashboard_en.png)

---

<a name="dashboard"></a>
## 3. Panel Genel Bakış

Panel, **Yüksek Yoğunluklu Tanı İstasyonu** olarak tasarlanmıştır — her piksel bilgi taşır.

![Panel Tam Görünüm](images/v1.2/dashboard_tr.png)

### Düzen Bölgeleri

| Bölge | Açıklama |
|---|---|
| **StatBar** (üst) | 13 canlı KPI — baud hızı, paket hızı, hata oranı, sağlık puanı, çalışma süresi |
| **Dalga Formu Paneli** (merkez) | İmleç ölçümlü çok kanallı osiloskop |
| **Telemetri Izgarası** (sağ) | Renk kodlu gerçek zamanlı sensör alan değerleri |
| **Kontrol Paneli** (sol alt) | Başlat/durdur, senaryo seçimi, hata enjeksiyonu |
| **Tanı Çubuğu** (alt) | Çerçeve sayacı, çerçeveleme hataları, senkronizasyon durumu |

### StatBar KPI'ları
- **Baud Hızı**: Jitter düzeltmesi sonrası efektif baud hızı.
- **Paket Hızı**: Saniyedeki paket sayısı (500 ms hareketli ortalama).
- **Hata Oranı**: Eşlik, çerçeveleme veya CRC hatası içeren çerçeve yüzdesi.
- **Sağlık Puanı**: Bileşik sinyal kalitesi puanı (0–100). 80 altı uyarı tetikler.
- **Çalışma Süresi**: Milisaniye hassasiyetiyle oturum süresi.
- **Tampon Doluluk**: Gerçek zamanlı halka tampon kullanımı — taşma riskini tespit için kritik.

### Bento-Grid Düzeni
v1.4.0'da tüm paneller **Bento-Grid** sistemini kullanır. Bu, 13px yazı tipi ölçeğinde tanısal okunabilirliği korurken bilgi yoğunluğunu v1.3'e kıyasla %60 artırır.

---

<a name="telemetry"></a>
## 4. Telemetri ve Canlı Metrikler

![Telemetri Paneli](images/v1.2/telemetry_live.png)

Telemetri Paneli, UART paketinin her alanını gerçek zamanlı olarak çözer ve mühendislik birimi değerini renk kodlu durum göstergeleriyle görüntüler.

### Alan Durum Renkleri
| Renk | Anlam |
|---|---|
| 🟢 Yeşil | Değer normal çalışma aralığı içinde |
| 🟡 Sarı | Değer eşiğe yaklaşıyor — izle |
| 🔴 Kırmızı | Değer aralık dışı — hata durumu |
| ⚫ Gri | >500 ms'dir veri alınmadı — eski veri |

### Çözülen Alan Türleri
- **Tamsayı (uint8, uint16, uint32)**: Opsiyonel ölçekleme formülüyle ham bayt değeri.
- **Sabit Noktalı Float**: `değer / bölen + offset` — Profil Düzenleyici'de yapılandırılabilir.
- **IEEE 754 Float**: Tam 4 bayt little-endian veya big-endian float.
- **Enum**: İnsan tarafından okunabilir etiketlere eşlenir (örn. `0x01 = "BOŞTA"`, `0x02 = "AKTİF"`).
- **Checksum / CRC**: Otomatik olarak doğrulanır; uyumsuzluk `❌ CRC HATASI` olarak gösterilir.

![Telemetri Statik](images/v1.2/telemetry.png)

### İmleç Ölçümü
Telemetri Paneli'nde herhangi bir alan değerine tıklayarak onu referans olarak **sabitleyin**. Gelecekteki okumalar, sabitlenmiş taban değerine göre değişimi gösteren bir delta (Δ) göstergesiyle birlikte görünür. Sürüklenme analizi için idealdir.

---

<a name="waveform-designer"></a>
## 5. Özel Dalga Formu Tasarımcısı

> **v1.4.0'da Yeni** — En çok istenen özellik. Keyfi bayt düzeyinde dalga formları tasarlayın ve doğrudan simülasyona enjekte edin.

![Dalga Formu Tasarımcısı](images/v1.3/designer_live.png)

### 5.1 Serbest Çizim Modu
Farenizi veya dokunmatik ekranı kullanarak sinyal tuvale doğrudan çizin. Sistem, çizimlerinizi gerçek zamanlı olarak 0–255 bayt değerlerine normalize eder.

**Kullanım Senaryoları**:
- Aritmi tespiti testi için özel EKG anomalisi (PVC, LBBB paterni) çizin.
- İvmeölçer eşik testleri için mekanik şok profili çizin.
- El çizimi eğrisiyle sensör ısınma kaymasını simüle edin.

### 5.2 Matematiksel Formül Modu
Her pakette değerlendirilen JavaScript matematik ifadelerini kullanarak sinyal üretin:

```javascript
// Sönümlü sinüs dalgası (ring-down)
Math.sin(t / 50) * Math.exp(-t / 500) * 127 + 128

// Chirp sinyali (frekans süpürmesi)
Math.sin(t * t / 50000) * 127 + 128

// PWM tipi kare dalga
(t % 100 < 50) ? 255 : 0

// Kalp atışı şekli (çift Gauss)
Math.exp(-Math.pow((t % 800 - 200) / 40, 2)) * 200 +
Math.exp(-Math.pow((t % 800 - 350) / 25, 2)) * 80
```

**Kullanılabilir değişkenler**:
| Değişken | Tür | Açıklama |
|---|---|---|
| `t` | number | Milisaniye cinsinden geçen süre |
| `i` | number | Paket sıra indeksi |
| `f` | object | Mevcut çözümlü alan değerleri |
| `Math` | object | Tam JS Math kütüphanesi |

### 5.3 Tıbbi Önayar Kütüphanesi
Önceden yüklenmiş klinik kalitede dalga formu şablonları:

| Önayar | Açıklama | Örnekleme Hızı |
|---|---|---|
| **EKG — Normal Sinüs** | P-QRS-T kompleksi, 72 BPM | 500 Hz |
| **EKG — Atriyal Fibrilasyon** | Düzensiz ritim, belirgin P yok | 500 Hz |
| **EKG — V-Fib** | Kaotik ventriküler fibrilasyon | 500 Hz |
| **PPG — SpO₂** | Nabız pletismografisi, %98 SpO₂ | 100 Hz |
| **Solunum** | Göğüs empedans pnömografisi | 50 Hz |
| **Kan Basıncı (NIPB)** | Osilometrik basınç eğrisi | 10 Hz |

![Dalga Formu Analizi](images/v1.2/waveforms_live.png)

### 5.4 Dalga Formu Analizörü Derinlemesine

Yerleşik dalga formu analizörü, veri noktaları arasında düzgün eğriler oluşturmak için **Cubic Spline İnterpolasyonu** kullanır. Bu kozmetik değil — Nyquist üzerinde örneklenen bant sınırlı sinyaller için matematiksel olarak doğrudur.

**İmleç Ölçüm Araçları**:
- **Tek İmleç**: Herhangi bir zaman pozisyonundaki genlik değerini okur.
- **Çift İmleç (Δt modu)**: İki nokta arasındaki zaman aralığını mikrosaniye hassasiyetiyle ölçer.
- **Çift İmleç (ΔV modu)**: Genlik farkını ölçer — DC offset analizi için kullanışlıdır.
- **Tepe Tespiti**: Yapılandırılabilir eşiğin üzerindeki tüm yerel maksimum/minimumları otomatik olarak işaretler.

![Dalga Formu Statik](images/v1.2/waveforms.png)

---

<a name="signal-integrity"></a>
## 6. Sinyal Bütünlüğü Laboratuvarı

"Mükemmel" bir UART hattını simüle etmek kolaydır. Gerçek gömülü sistemler karmaşıktır. **Sinyal Bütünlüğü Laboratuvarı**, ürün yazılımınızı güçlendirmek için fiziksel katman bozulmalarını simüle etmenizi sağlar.

![Sinyal Bütünlüğü](images/pro_integrity.png)

### 6.1 Gaussian Gürültü Enjeksiyonu

Yapılandırılabilir sigma (σ) ile Gaussian beyaz gürültü olarak modellenmiş rastgele voltaj dalgalanmaları ekler (%0,1–30 tam ölçek arası).

**Mühendislik Teorisi**: Gerçek sistemlerde gürültü güç kaynağı dalgalanmasından, PCB çapraz bağlantısından ve UART alıcısının giriş karşılaştırıcısındaki termal gürültüden kaynaklanır. Bu, karşılaştırıcınızın histerezisinin sahte bit geçişlerini önlemek için yeterli olup olmadığını test eder.

**Parametreler**:
- `σ (Sigma)`: Sinyal genliğinin yüzdesi olarak gürültü standart sapması.
- `Tohum (Seed)`: Tekrarlanabilir test çalıştırmaları için rastgele tohumu sabitleyin.

### 6.2 Mikro-Jitter (Zamanlama Kayması)

Yapılandırılabilir bir dağılımı izleyen (Gaussian veya Düzgün) paket başına zamanlama varyasyonu ekler.

**Mühendislik Teorisi**: Gerçek UART'lar kristal veya RC osilatörlerden saatlenir. Sıcaklık, besleme gerilimi ve eskime frekans kaymasına neden olur. ±%1 baud hızı hatası bile uzun bir çerçevede bit örneklemenin göz örüntüsünün dışına kaymasına neden olabilir.

**Parametreler**:
- `Jitter Genliği`: Mikrosaniye cinsinden tepe zamanlama sapması.
- `Dağılım`: Gaussian (ilişkili kayma) veya Düzgün (rastgele atlama).
- `Frekans`: Jitter'ın ne kadar hızlı salındığı — hızlı güç kaynağı gürültüsüne karşı yavaş sıcaklık kaymasını modeller.

### 6.3 Bit Hata Oranı (BHO) Enjeksiyonu

Belirli bir BHO olasılığına göre rastgele bitleri çevirir.

**Parametre**: BHO'yu `1e-7`'den (son derece temiz kanal) `1e-2`'ye (ciddi şekilde bozulmuş) ayarlayın.

**Kullanım Senaryosu**: CRC veya eşlik hata tespitinizin bozulmuş çerçevelerin beklenen fraksiyonunu yakaladığını doğrulayın. BHO = 1e-4 ve 8 baytlık çerçevelerde, hata sayacınızın %0,06 çerçeve hatası gösterdiğini doğrulayın.

### 6.4 Patlama Hata Enjeksiyonu

Gerçek dünya EMI'si (motorlardan, rölelerden, anahtarlamalı güç kaynaklarından) rastgele bitler olarak görünmez — birçok ardışık biti bozan **patlamalar** olarak görünür.

**Parametreler**:
- `Patlama Uzunluğu`: Ardışık bozulmuş bit sayısı (1–64).
- `Patlama Hızı`: Saniyedeki ortalama patlama sayısı.
- `Desen`: Tümü sıfır, tümü bir veya dönüşümlü (0x55/0xAA).

### 6.5 Sinyal Bütünlüğü Tanılaması

Bütünlük hataları etkinleştirilmiş şekilde ≥5 saniye simülasyon çalıştırdıktan sonra **Bütünlük Raporu** otomatik olarak oluşturulur:
- Zamanlama marjini gösteren Göz Diyagramı (simüle edilmiş).
- Yapılandırılan ve ölçülen Bit Hata Oranı karşılaştırması.
- Öneri: "Eşlik korumasını artırın" veya "Donanım CRC-16 ekleyin."

---

<a name="advanced-lab"></a>
## 7. Gelişmiş Laboratuvar Modülleri

![Laboratuvar Genel Bakış](images/lab.png)

### 7.1 Diferansiyel Analiz (Lab Diff)

**Lab Diff** modülü, yakalanan herhangi iki çerçeve arasında bit düzeyinde karşılaştırma yaparak hangi bitlerin ve alanların değiştiğini tam olarak vurgular.

![Lab Diff](images/v1.2/lab_diff_live.png)

**İş Akışı**:
1. Çerçeve A'yı yakalayın — geçmiş tablosundaki herhangi bir çerçeveye sağ tıklayın ve **"Referans Olarak Sabitle"** seçeneğini seçin.
2. Simülasyonu ilgilendiğiniz bir çerçeve görünene kadar çalıştırın.
3. Yeni çerçeveye sağ tıklayın ve **"Referansla Karşılaştır"** seçeneğini seçin.
4. Diff görünümü, alan adı açıklamalarıyla birlikte bayt düzeyindeki değişiklikleri kırmızı/yeşil olarak vurgular.

**Gelişmiş**: 10 ardışık çerçeve üzerinde bir "diff şelalesi" görmek için **Çok Çerçeveli Diff**'i etkinleştirin — kademeli sensör kaymasını tespit etmek için idealdir.

### 7.2 Öğrenme Modu

![Öğrenme Modu](images/v1.2/learn_live.png)

Öğrenme Modu, her paneli ve özelliği adım adım açıklayan etkileşimli bir tutorial katmanıdır. UI öğelerini vurgular ve bağlamsal mühendislik açıklamaları sunar.

**Aşamalar**: Her büyük özelliği kapsayan 12 aşama, tamamlanması tahminen 15 dakika.

---

<a name="logic-analyzer"></a>
## 8. Mantık Analizörü

Mantık Analizörü, UART bayt akışını fiziksel katman temseline — yüksek/düşük mantık durumlarının görsel bir zaman çizelgesine — çözer.

![Mantık Analizörü](images/v1.2/logic_live.png)

### Sinyal Oluşturma
Her bit, aşağıdakilerle dikdörtgen mantık seviyesi olarak işlenir:
- Başlangıç bitinden önce **Boşta hat** (mantık 1).
- **Başlangıç biti** (mantık 0) — her zaman 1 bit genişliğinde.
- **Veri bitleri** (varsayılan olarak LSB önce, MSB önce olarak yapılandırılabilir).
- **Eşlik biti** (etkinse) — farklı bir renkte gösterilir.
- **Stop bit(ler)** (mantık 1).

### Yakınlaştırma ve Kaydırma
| Eylem | Kontrol |
|---|---|
| Yakınlaştır | Fare tekerleği yukarı / `+` tuşu |
| Uzaklaştır | Fare tekerleği aşağı / `-` tuşu |
| Kaydır | Tıkla + sürükle / ok tuşları |
| Görünümü Sıfırla | Çift tıkla / `Home` tuşu |
| Aralık Seç | Shift + sürükle |

### Protokol Çözücüler

Mantık Analizörü, UART üzerinden iç içe protokolleri çözebilen bir **Çok Protokollü Çözücü** içerir:

![Protokol Çözücüler](images/pro_decoders.png)

| Çözücü | Açıklama |
|---|---|
| **Ham Hex** | Her çerçevenin üzerinde hex değerini gösterir |
| **ASCII** | Yazdırılabilir karakterleri satır içinde gösterir |
| **NMEA 0183** | GPS cümle alanlarını ayrıştırır |
| **Modbus RTU** | Fonksiyon kodunu, register adresini, veriyi çözer |
| **Özel (JSON)** | JSON şeması kullanarak kendi çözücünüzü tanımlayın |

![Mantık Statik](images/v1.2/logic.png)

---

<a name="dsp-analysis"></a>
## 9. DSP ve Spektral Analiz

### 9.1 FFT Spektrum Analizörü

![Spektrum Analizörü](images/v1.2/spectrum_live.png)

FFT Analizörü, **Cooley-Tukey Hızlı Fourier Dönüşümü** algoritması (O(n log n)) kullanarak zaman alanı dalga formu verilerini frekans alanına dönüştürür.

**Yapılandırma**:
| Parametre | Seçenekler | Notlar |
|---|---|---|
| **FFT Boyutu** | 256, 512, 1024, 2048, 4096 | Büyük = daha yüksek frekans çözünürlüğü, daha fazla CPU |
| **Pencere Fonksiyonu** | Dikdörtgen, Hanning, Hamming, Blackman | Hanning: genel sinyaller için en iyi |
| **Örtüşme** | %0, %25, %50, %75 | Daha yüksek örtüşme = daha düzgün spektrum ama daha fazla CPU |
| **Görüntü Modu** | Doğrusal, dBFS (logaritmik) | Geniş dinamik aralık için dBFS önerilir |
| **Ortalama** | 1–64 çerçeve | Daha yüksek = daha az gürültü, daha yavaş tepki |

**Spektrumu Okuma**:
- **Temel frekans** en uzun tepe olarak görünür.
- **Harmonikler** 2f, 3f, 4f'de görünür — doğrusal olmama veya kırpma gösterir.
- **DC bileşeni** (0 Hz kutusu) — büyük bir DC tepe genellikle sensör offsetinin telafi edilmediği anlamına gelir.
- **Gürültü tabanı** — spektral "halı". Sinyal SNR'ı ölçmek için sinyalle ve sinyalsiz karşılaştırın.

### 9.2 Pencere Fonksiyonları Açıklaması

| Pencere | Frekans Çözünürlüğü | Genlik Doğruluğu | Yan Lob Seviyesi | En İyi Kullanım |
|---|---|---|---|---|
| **Dikdörtgen** | En iyi | Zayıf | −13 dB | Durağan sinüsoidler, kısa patlamalar |
| **Hanning** | İyi | İyi | −31 dB | Genel amaç |
| **Hamming** | İyi | Daha İyi | −41 dB | Konuşma, ses |
| **Blackman** | Orta | Mükemmel | −57 dB | Yüksek dinamik aralık (EKG, PPG) |

![Spektrum Statik](images/v1.2/spectrum.png)

### 9.3 Sinyal-Gürültü Oranı (SGO) Ölçümü
SGO aracı, baskın spektral tepeyi otomatik olarak tanımlar ve şunu hesaplar:

```
SGO (dB) = 20 × log₁₀(Sinyal RMS / Gürültü RMS)
```

Sağlıklı bir UART iletilen sensör sinyali SGO > 40 dB göstermelidir. SGO < 20 dB ise Sinyal Bütünlüğü Laboratuvarı'nda gürültü filtrelemesini etkinleştirin.

---

<a name="hardware"></a>
## 10. Donanım Simülasyonu

![Donanım Paneli](images/v1.2/hardware_live.png)

Donanım Simülasyonu modülü, bir ağ topolojisinde bağlı birden fazla sanal UART cihazını modeller.

### 10.1 Çok Cihazlı Topoloji
Herhangi bir topolojide **8 sanal cihaza** kadar bağlayın:
- **Noktadan Noktaya**: Tek master ↔ tek slave (standart UART).
- **Çok Noktalı Bus**: Bir master, birden fazla slave (RS-485 tarzı, adres tabanlı tahkim).
- **Geri Döngü**: TX, RX'e bağlı — yankı testi ve gecikme ölçümü için kullanışlı.

### 10.2 Donanım Profil Yapılandırması
Her sanal cihazın bağımsız bir donanım profili vardır:

| Parametre | Aralık | Açıklama |
|---|---|---|
| Baud Hızı | 300 – 921600 | Seri hız |
| Veri Bitleri | 5, 6, 7, 8 | Kelime uzunluğu |
| Eşlik | Yok, Çift, Tek, Mark, Space | Hata tespiti |
| Stop Bitleri | 1, 1.5, 2 | Çerçeve sonlandırma |
| Akış Kontrolü | Yok, RTS/CTS, XON/XOFF | Geri basınç mekanizması |
| Tampon Boyutu | 64 B – 64 KB | RX/TX tampon derinliği |

![Donanım Statik](images/v1.2/hardware.png)

### 10.3 Gecikme Simülasyonu
Gerçekçi iletişim gecikmesini modelleyin:
- **Yayılma Gecikmesi**: Bakır tel için metre başına 5 ns.
- **Sürücü Etkinleştirme Süresi**: RS-485 dönüş gecikmesi (yapılandırılabilir: 0–1000 µs).
- **FIFO Derinliği**: Belirli bir donanım FIFO derinliğine sahip UART simüle edin.

---

<a name="profile-editor"></a>
## 11. Profil Şablonu Düzenleyici

Profil Düzenleyici, UART Pro Lab'ın kalbidir — ham baytların mühendislik birimi sensör verilerine nasıl çözüleceğini tanımlar.

![Profil Düzenleyici Canlı](images/v1.2/profile_editor_live.png)

### 11.1 Paket Yapısı Tanımı

Bir profil, tam bir paket formatı tanımlar:

```json
{
  "name": "IMU_MPU6050",
  "syncByte": "0xAA",
  "frameLength": 18,
  "crc": { "type": "CRC-16/CCITT", "position": "last2" },
  "fields": [
    { "name": "Ivme_X", "offset": 1, "length": 2, "type": "int16_le", "scale": 0.001, "unit": "g" },
    { "name": "Ivme_Y", "offset": 3, "length": 2, "type": "int16_le", "scale": 0.001, "unit": "g" },
    { "name": "Ivme_Z", "offset": 5, "length": 2, "type": "int16_le", "scale": 0.001, "unit": "g" },
    { "name": "Jiroskop_X", "offset": 7, "length": 2, "type": "int16_le", "scale": 0.061, "unit": "°/s" },
    { "name": "Sicaklik", "offset": 13, "length": 2, "type": "int16_le", "scale": 0.00294, "offset_val": 21, "unit": "°C" }
  ]
}
```

### 11.2 Desteklenen Veri Türleri

| Tür | Bayt | Açıklama |
|---|---|---|
| `uint8` | 1 | İşaretsiz bayt |
| `int8` | 1 | İşaretli bayt |
| `uint16_le` / `uint16_be` | 2 | İşaretsiz 16-bit, little/big endian |
| `int16_le` / `int16_be` | 2 | İşaretli 16-bit |
| `uint32_le` | 4 | İşaretsiz 32-bit |
| `float32_le` | 4 | IEEE 754 tek hassasiyetli float |
| `bcd` | değişken | Binary Coded Decimal (GPS NMEA zaman damgaları için) |
| `ascii` | değişken | Sabit uzunluklu ASCII dizisi |
| `bitfield` | 1–4 | Belirli bit offsetinde bir bayttan N bit çıkar |

### 11.3 Doğrulama Kuralları
Her alana otomatik doğrulama ekleyin:

```json
{
  "name": "Kalp_Hizi",
  "validation": { "min": 30, "max": 300, "unit": "BPM", "alarm": "critical" }
}
```

Doğrulama başarısızlıkları Telemetri Paneli'nde (kırmızı) görünür ve Doğrulama Raporu'nun Sağlık Puanına katkıda bulunur.

![Profil Düzenleyici Statik](images/v1.2/profile_editor.png)

### 11.4 Profil Şablonu Kütüphanesi
21 önceden oluşturulmuş profil dahildir:

| Kategori | Profiller |
|---|---|
| **Tıbbi** | EKG (ADS1292), SpO₂ (MAX30102), Kan Basıncı, Sıcaklık (DS18B20) |
| **IMU / Hareket** | MPU-6050 (6 eksen), ICM-42688 (6 eksen), BNO085 (9 eksen + AHRS) |
| **Çevresel** | BME280, SHT31, CCS811 (CO₂/VOC) |
| **GPS** | NMEA-0183 GPRMC, uBlox UBX ikili |
| **Endüstriyel** | Modbus RTU, Profibus DP (alt küme) |

![Profil Şablonları](images/profiles.png)

---

<a name="scenarios"></a>
## 12. Senaryo Motoru ve Test

### 12.1 Senaryo Motoru

![Senaryolar Canlı](images/v1.2/scenarios_live.png)

Senaryo Motoru, simülasyon sırasında belirli zamanlarda gerçekleşen **deterministik test dizileri** — olaylar serisi — tanımlamanıza olanak tanır.

**Senaryo Olay Türleri**:
| Tür | Açıklama |
|---|---|
| `inject_fault` | Belirli bir hata ekle (çerçeveleme hatası, eşlik hatası vb.) |
| `change_field` | Belirli bir zamanda sensör alan değerini geçersiz kıl |
| `set_integrity` | Simülasyon ortasında gürültü/jitter parametrelerini değiştir |
| `send_command` | Akışa belirli bir bayt dizisi enjekte et |
| `assert` | Belirli bir zamanda bir alan değerini doğrula — yanlışsa testi başarısız kıl |
| `snapshot` | Rapora tam telemetri anlık görüntüsü ekle |

**Senaryo YAML Formatı**:
```yaml
name: "EKG Aritmi Tespiti Testi"
profile: "ECG_ADS1292"
duration: 30000   # ms
events:
  - t: 5000
    type: change_field
    field: HR_BPM
    value: 220
    comment: "Taşikardi enjekte et"
  - t: 10000
    type: inject_fault
    fault: framing_error
  - t: 15000
    type: assert
    field: STATUS
    expected: 0x02
    comment: "Firmware ALARM bitini ayarlamış olmalı"
```

### 12.2 Test Paketi

![Test Paketi](images/v1.2/test_suite.png)

Test Paketi, tanımlı senaryolarınıza karşı otomatik doğrulama oturumları çalıştırır ve zamanlama açıklamalarıyla geçti/kaldı sonuçları üretir.

**Test Raporu Alanları**:
- **Test Adı**: Senaryo tanımlayıcısı.
- **Süre**: Toplam geçen süre.
- **Tetiklenen Olaylar**: Gerçekleşen senaryo olaylarının sayısı.
- **Geçen / Kalan İddialar**: CI entegrasyonu için kritik.
- **Sağlık Puanı**: 0–100 bileşik kalite metriği.
- **Hata Kapsamı**: Uygulanan tanımlı hata türlerinin yüzdesi.

![Test Canlı](images/v1.2/testing_live.png)

---

<a name="automation"></a>
## 13. Otomasyon ve Betikleme

### 13.1 Dinamik Yanıtlayıcı

Betik motoru, alınan verilere akıllıca yanıt veren etkileşimli bir **Dijital İkiz** oluşturmanızı sağlar.

![Betikleme](images/v1.2/scripting_live.png)

**Tam JavaScript API'si**:
```javascript
// === UART Pro Lab Betikleme API'si ===

// Tam bir çerçeve her alındığında çağrılır
onReceive((data, decoded) => {
  // data: ham baytların Uint8Array'i
  // decoded: alan adı → mühendislik değeri nesnesi

  // Örnek: Pil yönetimi yanıtı
  if (decoded.CMD === 0x05) {
    const batSeviyesi = Math.round(Math.random() * 100);
    send([0xAA, 0x05, batSeviyesi, 0x00, crc16([0x05, batSeviyesi])]);
  }

  // Örnek: Watchdog canlı tutma
  if (decoded.CMD === 0x01) {
    send([0xAA, 0x01, 0x00, 0xFF]);  // ACK
  }
});

// Alınan veriden bağımsız olarak sabit aralıklarda çağrılır
onTimer(1000, () => {
  // Her 1000 ms'de kalp atışı gönder
  send([0xAA, 0xFF, 0x00, 0xFF]);
});

// Yardımcı fonksiyonlar
function crc16(bytes) { /* yerleşik */ }
function crc8(bytes) { /* yerleşik */ }
function toFloat32(b0, b1, b2, b3) { /* yerleşik */ }
function log(msg) { /* Betik Konsoluna yazdırır */ }
```

### 13.2 Makro Kayıt
Bir dizi UI eylemini (başlat, durdur, baud hızını değiştir, hata enjekte et) kaydedin ve otomatik olarak tekrar oynatın. Makrolar JSON olarak kaydedilir ve oturumlar arasında paylaşılabilir.

### 13.3 Toplu İşleme
Önceden kaydedilmiş `.bin` oturum dosyalarını başsız toplu modda işleyin:
1. Bir veya daha fazla `.bin` dosyası yükleyin.
2. Bir profil ve doğrulama kural seti seçin.
3. Motor tüm dosyaları işler ve dosya başına sağlık puanlarıyla birleşik bir rapor oluşturur.

---

<a name="visualizer"></a>
## 14. 3D Görselleştirici

3D Görselleştirici, IMU sensör verilerini gerçek zamanlı 3D katı cisim olarak işler — kuaternyon matematiğinizi veya Euler açısı çıktınızı doğrulamanın en hızlı yolu.

![3D Görselleştirici](images/v1.2/visualizer_3d.png)

### Desteklenen Yönelim Formatları
| Format | Gereken Alanlar |
|---|---|
| **Euler Açıları** | Yuvarlanma, Eğim, Sapma (derece veya radyan) |
| **Kuaternyon (WXYZ)** | W, X, Y, Z (normalleştirilmiş) |
| **Dönme Matrisi** | 3×3 matris (9 float alan) |
| **Eksen-Açı** | Eksen X/Y/Z + Açı |

### Oluşturma Seçenekleri
- **Referans Çerçevesi**: NED (Kuzey-Doğu-Aşağı, havacılık) veya ENU (Doğu-Kuzey-Yukarı, robotik) seçin.
- **Izgarası**: Seçilebilir ölçekli zemin düzlemi ızgarasını aç/kapat.
- **Eksenler**: Cisim sabit X/Y/Z eksenlerini renkli oklar olarak göster.
- **Yörünge**: Katı cisim üzerindeki seçili noktanın son N saniyedeki yolunu çiz.
- **Gimbal Kilit Göstergesi**: Euler temsili için eğim ±90°'ye yaklaştığında vurgular.

![Görselleştirici Canlı](images/v1.2/visualizer_live.png)

---

<a name="session"></a>
## 15. Oturum Yönetimi ve Geri Oynatma

### 15.1 Kayıt

Her simülasyon oturumu otomatik olarak dahili bir halka tamponuna kaydedilir. Kayıt şunları içerir:
- Mikrosaniye zaman damgalarıyla tam ham bayt akışı.
- Her paketteki çözümlü alan değerleri.
- Tüm hata enjeksiyon olayları.
- Senaryo olayları ve iddialar.

**Manuel Dışa Aktarma**: `.bin` dosyası (özel format) veya `.csv` dosyası (yalnızca çözümlü alanlar) olarak dışa aktarmak için **💾 Oturumu Kaydet**'e tıklayın.

### 15.2 Geri Oynatma

![Geri Oynatma](images/v1.2/playback_live.png)

Geri Oynatma motoru, kaydedilen herhangi bir oturumu piksel mükemmelliğinde zamanlama doğruluğuyla yeniden çalıştırır.

**Geri Oynatma Kontrolleri**:
| Kontrol | Eylem |
|---|---|
| ▶ Oynat | 1× hızda oynatmayı başlat |
| ⏸ Duraklat | Mevcut konumda dondur |
| ⏹ Durdur | Başa dön |
| ◀◀ / ▶▶ | 10 saniye geri/ileri atla |
| Hız | 0.1× ile 10× arası |

**Açıklama Modu**: Duraklatılmış durumdayken, zaman çizelgesindeki herhangi bir noktaya sağ tıklayarak metin açıklaması ekleyin. Açıklamalar oturum dosyasına gömülür ve PDF raporunda görünür.

### 15.3 Zaman Çizelgesi Gezgini

![Zaman Çizelgesi](images/v1.2/timeline_live.png)

Zaman Çizelgesi Gezgini, tüm oturumun kaydırılabilir, yakınlaştırılabilir makro görünümünü sağlar:
- Renk kodlu olay işaretçileri (hatalar, iddialar, açıklamalar).
- Hızlı gezinme için dalga formu küçük resim "mini haritası".
- Oturum üzerinde gezinmek için görünüm penceresini sürükleyin.

---

<a name="reporting"></a>
## 16. Doğrulama ve Raporlama

![Rapor](images/v1.2/report_live.png)

### 16.1 Doğrulama Raporu (PDF Dışa Aktarma)

Doğrulama Raporu, **düzenleyici kuruluşlara sunuma** uygun (IEC 60601-1, ISO 13485 bağlamları) üretime hazır bir PDF belgesidir. Şunları içerir:

| Bölüm | İçerik |
|---|---|
| **Yönetici Özeti** | Sağlık Puanı, test süresi, geçti/kaldı kararı |
| **Sinyal Kalitesi Analizi** | BHO, SGO, hata oranı trend grafikleri |
| **Alan Doğrulama Matrisi** | Her alan, aralık kuralı, ölçülen min/maks ve geçti/kaldı |
| **Hata Enjeksiyon Özeti** | Tüm enjekte edilen hatalar ve tespit edilip edilmediği |
| **İddia Günlüğü** | Zaman damgası ve sonuçlarıyla her iddia olayı |
| **Dalga Formu Ekran Görüntüleri** | Anahtar senaryo zaman damgalarında otomatik yakalandı |
| **Ham Veri İstatistikleri** | Paket sayısı, çerçeve uzunluğu dağılımı, zamanlama jitter histogramı |

### 16.2 Sağlık Puanı Hesaplaması

```
Sağlık Puanı = 100
  - (Hata Oranı × 30)      # Çerçeveleme/eşlik/CRC hataları
  - (BHO × 20)             # Beklenen bit hatalarına karşı
  - (SGO Cezası × 20)      # SGO < 30 dB ise
  - (Jitter Cezası × 15)   # Jitter > bit periyodunun %5'i ise
  - (İddia Başarısızlıkları × 15) # Başarısız senaryo iddiaları
```

Düzenleyici kalitede belgeler için **≥ 90** puan gereklidir.

### 16.3 Tanı Paneli

![Tanı Canlı](images/v1.2/diagnostics_live.png)

Canlı Tanı Paneli şunları gösterir:
- **Hata Türü Dağılımı**: Çerçeveleme ve eşlik ve CRC hatalarının pasta grafiği.
- **Zaman İçinde Hata Oranı**: 5 saniyelik hareketli trend çizgisi.
- **Bayt Dağılımı**: Alınan tüm bayt değerlerinin histogramı — takılı sensörleri tespit etmek için kullanışlı.
- **Paketler Arası Zamanlama**: Ardışık çerçeveler arasındaki sürenin histogramı — jitter görselleştirmesi.

![Tanı Statik](images/v1.2/diagnostics.png)

---

<a name="shortcuts"></a>
## 17. Klavye Kısayolları

### Genel
| Kısayol | Eylem |
|---|---|
| `Boşluk` | Simülasyonu başlat / durdur |
| `Ctrl + S` | Oturumu kaydet |
| `Ctrl + O` | Oturumu aç |
| `Ctrl + E` | PDF raporunu dışa aktar |
| `Ctrl + Z` | Son yapılandırma değişikliğini geri al |
| `Ctrl + /` | Komut Paletini aç |
| `?` / `F1` | Bu Yardım'ı aç |
| `Esc` | Modalı kapat / eylemi iptal et |

### Panel
| Kısayol | Eylem |
|---|---|
| `F` | Tam ekran dalga formunu aç/kapat |
| `C` | Dalga formu geçmişini temizle |
| `R` | Tüm sayaçları sıfırla |
| `N` | Gürültü enjeksiyonunu aç/kapat |
| `J` | Jitter enjeksiyonunu aç/kapat |
| `1–8` | Cihaz 1–8'i seç (çok cihaz modu) |

### Mantık Analizörü
| Kısayol | Eylem |
|---|---|
| `+` / `-` | Yakınlaştır / uzaklaştır |
| `Home` | Yakınlaştırmayı sıfırla |
| `D` | Çözücü katmanını aç/kapat |
| `M` | Ölçüm işaretçisi yerleştir |

### Geri Oynatma
| Kısayol | Eylem |
|---|---|
| `Boşluk` | Oynat / Duraklat |
| `←` / `→` | Bir çerçeve geri/ileri adım at |
| `Shift + ←` / `→` | 10 saniye atla |
| `[` / `]` | Hızı azalt / artır |

---

<a name="troubleshooting"></a>
## 18. Sorun Giderme ve Optimizasyon

### Sık Karşılaşılan Sorunlar

#### Çerçeveleme Hataları (0xFE) — Yüksek Oran
**Belirti**: Hata sayacı hızla artıyor, ham veri `0xFE` çerçeveleme hata baytları gösteriyor.
**Nedenler ve Çözümler**:
1. **Baud hızı uyumsuzluğu**: Verici ve alıcı baud hızlarının eşleştiğini doğrulayın. %0,5'lik bir fark bile uzun çerçevelerde hata biriktirebilir.
2. **Yanlış stop bit sayısı**: Sensör 2 stop bit kullanıyorsa ama profil 1 diyorsa, her çerçevede çerçeveleme hatası oluşur.
3. **Hat gürültüsü**: Lab ayarlarında Sinyal Bütünlüğü gürültü filtresini etkinleştirin.

#### Senkronizasyon Kaybı — Paket Çözücü Senkronu Kaybediyor
**Belirti**: Çözümlü alanlar çöp değerler gösteriyor, "SYNC KAYDI" rozeti görünüyor.
**Nedenler ve Çözümler**:
1. **Yanlış senkronizasyon baytı**: Profil Düzenleyici'deki `syncByte`'ın cihazınızın gerçek senkronizasyon baytıyla eşleştiğini kontrol edin.
2. **Değişken uzunluklu çerçeveler**: Sensörünüz değişken uzunluklu çerçeveler kullanıyorsa, profilin `frameMode`'unu `fixed`'dan uzunluk alanı offsetiyle `variable`'a değiştirin.
3. **Bozulmuş ilk bayt**: "Yeniden Senkronize Et" düğmesini kullanın — senkronizasyon baytının bir sonraki oluşumuna hızlıca ilerler.

#### Yüksek CPU / Yavaş UI
**Nedenler ve Çözümler**:
1. **FFT boyutu çok büyük**: FFT boyutunu 4096'dan 1024'e düşürün.
2. **Yüksek baud hızı ile %75 örtüşme**: Örtüşme ortalaması CPU yoğundur. %0 veya %25'e düşürün.
3. **Çok fazla çözümlü alan**: >30 alana sahip profiller düzen çökmesine neden olabilir. Kullanılmayan alan gruplarını daraltın.
4. **WebGL devre dışı**: Tarayıcı ayarlarında donanım hızlandırmasının etkin olduğundan emin olun — onsuz 3D Görselleştirici CPU oluşturmasına geri döner.

#### Oturum Dosyası Bozulmuş
**Belirti**: Yüklemede "Geçersiz oturum dosyası" hatası.
**Çözüm**: Oturum dosyaları `UART_PRO_1.4` sihirli başlığı kullanır. Dosya kesilmişse (örn. kayıt sırasında disk dolu), kurtarılamaz. Kayıttan sonra dosya boyutunu her zaman doğrulayın.

### Performans İpuçları
- **Yüksek Baud Hızları (>460800)**: Simülasyon motoru için CPU'yu serbest bırakmak amacıyla 3D Görselleştirici'yi ve Spektrum Analizörü'nü devre dışı bırakın.
- **Uzun Oturumlar (>1 saat)**: **Dairesel Tampon Modu**'nu etkinleştirin — eski veriler otomatik olarak temizlenir. Onsuz bellek kullanımı doğrusal olarak büyür.
- **Birden Fazla Cihaz**: Tüm 8 sanal cihazı aynı baud hızında tutun — motor tüm cihazlar için tek bir zaman tabanı kullanır.

---

<a name="glossary"></a>
## 19. Sözlük

| Terim | Tanım |
|---|---|
| **UART** | Evrensel Asenkron Alıcı/Verici — donanım seri iletişim protokolü |
| **Baud Hızı** | Saniyedeki sembol sayısı. UART için 1 baud = 1 bit/s |
| **Çerçeveleme Hatası** | Stop biti mantık 0 olarak tespit edildiğinde oluşur — baud hızı uyumsuzluğu gösterir |
| **Eşlik Hatası** | Alınan eşlik biti, veri bitlerinin hesaplanan eşliğiyle eşleşmiyor |
| **CRC** | Döngüsel Artıklık Kontrolü — polinom tabanlı hata tespiti sağlama toplamı |
| **BHO** | Bit Hata Oranı — herhangi bir bitin hatalı alınma olasılığı |
| **SGO** | Sinyal-Gürültü Oranı — sinyal gücünün gürültü gücüne oranı, dB cinsinden |
| **FFT** | Hızlı Fourier Dönüşümü — zaman alanı verilerini frekans alanına dönüştürür |
| **Jitter** | Sinyal geçişlerinin ideal konumlarına göre zamanlama varyasyonu |
| **Göz Diyagramı** | Birçok bit periyodunun üst üste bindirilmiş görünümü — "göz açıklığı" zamanlama marjinini gösterir |
| **Sağlık Puanı** | UART Pro Lab'ın sinyal kalitesi ve uyumluluk için bileşik 0–100 puanı |
| **Senkronizasyon Baytı** | Her paketin başını işaretleyen sabit bir bayt (örn. `0xAA`) |
| **Dijital İkiz** | Komutlara gerçek zamanlı yanıt veren bir donanım cihazının yazılım modeli |
| **Bento-Grid** | Panel düzeni sistemi — bilgi yoğun, modüler panel düzenlemesi |
| **Cubic Spline** | Düzgün dalga formu oluşturma için matematiksel interpolasyon tekniği |
| **Web Worker** | Tarayıcı arka plan thread'i — burada UI'dan simülasyonu izole etmek için kullanılır |

---

## Sonuç

**UART Pro Lab v1.4.0** bir simülatör değildir — tamamen tarayıcınızda çalışan eksiksiz bir **tıbbi kalitede, düzenleyici kuruluşlara hazır sinyal mühendisliği ortamıdır**.

Her özellik gerçek bir mühendislik sorununa yönelik tasarlandı: birim testlerinden kaçan çerçeveleme hataları, yalnızca termal stres altında görünen jitter, çıplak gözle görünmeyen dalga formu anomalileri. Bu araç hepsini ortaya çıkarır — silikon aşamasına ulaşmadan önce.

---

*Mustafa Sercan Sak — Baş Mimar*  
*© 2026 Mustafa Sercan Sak Diagnostics · v1.4.0-STABLE*
