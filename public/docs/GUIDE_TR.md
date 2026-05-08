# 🔬 UART PRO LAB — Ana Mühendislik Kılavuzu
## Profesyonel Simülasyon, Tanılama ve Doğrulama Paketi v1.4.0

**UART Pro Lab Ana Kılavuzu**'na hoş geldiniz. Bu belge, en gelişmiş UART simülasyon ortamı için kapsamlı bir teknik ve operasyonel kılavuz sağlar.

---

## 📑 İçindekiler
1. [🏗️ Sistem Mimarisi](#architecture)
2. [🎨 Özel Dalga Formu Tasarımcısı (Waveform Designer)](#waveform-designer)
3. [📡 Sinyal Bütünlüğü Teorisi](#signal-integrity)
4. [📊 Panel Detayları (Deep-Dive / High-Density)](#dashboard-details)
5. [🔬 Gelişmiş Laboratuvar Modülleri](#advanced-lab)
6. [📈 DSP ve Spektral Analiz](#dsp-analysis)
7. [📋 Yapılandırma ve Şablonlar](#config-templates)
8. [📄 Doğrulama ve Raporlama](#validation-reporting)
9. [🛠️ Protokol Mühendisliği](#protocol-engineering)
10. [🧪 Klinik Doğrulama](#clinical-validation)
11. [🤖 Otomasyon ve Betikleme](#automation)
12. [🎞️ Oturum Yönetimi](#session-management)
13. [🛠️ Sorun Giderme ve Optimizasyon](#troubleshooting)

---

<a name="architecture"></a>
## 🏗️ Sistem Mimarisi

UART Pro Lab, **Tauri 2 + Web Worker** mimarisi üzerine kurulmuştur. Uygulama tamamen yerel (native) bir masaüstü uygulamasıdır; bir sunucuya ihtiyaç duymaz.

- **Tauri (Rust) Katmanı**: Gerçek seri port (serialport crate) ve TCP haberleşmesi bu katmanda çalışır. Düşük gecikme ve doğrudan donanım erişimi sağlar.
- **Web Worker Motoru**: Simülasyon motoru (`simulation.worker.ts`) ayrı bir browser thread'inde çalışır; UI hiçbir zaman bloke olmaz. Çökme durumunda motor otomatik olarak yeniden başlatılır (en fazla 5 kez).
- **React UI Katmanı**: Vite + React 19 ile derlenir. Durum yönetimi `useReducer` + `Zustand` kombinasyonuyla sağlanır; yoğun veri (waveform geçmişi) React state dışında `useRef` içinde tutularak render döngüsü optimize edilir.

![Sistem Paneli](images/v1.2/dashboard_tr.png)

---

<a name="waveform-designer"></a>
## 🎨 Özel Dalga Formu Tasarımcısı (Waveform Designer)

v1.4.0 ile eklenen **Waveform Designer**, statik dalga formlarının ötesine geçmenizi sağlar.

### 1. Serbest Çizim (Freehand Draw)
- **Kullanım**: Fare veya dokunmatik ekran ile tuval üzerine kendi sinyalinizi çizin. 
- **Teknik**: Çizilen koordinatlar anında 0-255 aralığında byte verisine normalize edilir ve UART akışına enjekte edilir.

### 2. Matematiksel İfadeler (Math Formula)
- **Kullanım**: `Math.sin(t) * Math.exp(-t/100)` gibi karmaşık JS ifadeleriyle dinamik sinyaller üretin.
- **Parametreler**: `t` (milisaniye), `i` (paket indeksi) ve `f` (mevcut alanlar) değişkenlerini kullanarak interaktif formüller oluşturabilirsiniz.

### 3. Tıbbi Önayar Kütüphanesi (Presets)
- **EKG (P-QRS-T)**: Klinik standartlarda kalp sinyali.
- **PPG (Nabız)**: SpO2 ve nabız pletismografi dalgası.
- **Ventilasyon**: Solunum cihazı akış ve basınç eğrileri.

---

<a name="signal-integrity"></a>
## 📡 Sinyal Bütünlüğü Teorisi

"Mükemmel" bir UART hattını simüle etmek kolaydır, ancak gerçek dünya donanımı karmaşıktır. **Bütünlük Laboratuvarı (Integrity Lab)**, fiziksel katman bozulmalarını simüle etmenize olanak tanır.

### 1. Gaussian Gürültü Enjeksiyonu
- **Teori**: Simüle edilen sinyale rastgele voltaj dalgalanmaları ekleriz. Bu, alıcınızın karşılaştırıcı (comparator) mantığının "bulanık" bitleri nasıl yönettiğini test eder.

### 2. Mikro-Jitter (Zamanlama Kayması)
- **Teori**: Gerçek sistemlerde paketler arası süre sabit değildir. Jitter, göndericideki CPU çizelgelemesi veya kesme (interrupt) gecikmesinin neden olduğu kaymayı simüle eder.

---

<a name="dashboard-details"></a>
## 📊 Panel Detayları (Deep-Dive / High-Density)

v1.4.0 sürümünde arayüz, profesyonel tanı istasyonu standartlarına (High-Density) yükseltilmiştir.

### 📐 Bento-Grid ve Bilgi Yoğunluğu
- **Kompakt Tasarım**: Bilgi yoğunluğu %60 artırıldı. Tüm telemetri, dalga formu ve tanılama verileri tek ekranda, kaydırmaya gerek kalmadan izlenebilir.
- **13px Tipografi**: Tanısal verilerin okunabilirliğini bozmadan daha fazla veriyi sığdırmak için optimize edilmiş yazı tipi hiyerarşisi.

### 📈 Dalga Formu Analizörü
- **İnterpolasyon**: **Cubic Spline** interpolasyonu kullanıyoruz. Bu, tıbbi dalga formları için kritiktir; o olmadan bir EKG "merdiven" dizisi gibi görünürdü.
- **İmleçler**: İki tepe noktası arasındaki mesafeyi ölçmek için dikey imleçleri kullanın. Δt (Delta-Zaman) mikrosaniye çözünürlüğüyle hesaplanır.

![Dalga Formu Analizi](images/v1.2/waveforms_live.png)

---

<a name="advanced-lab"></a>
## 🔬 Gelişmiş Laboratuvar Modülleri

### 🧪 Diferansiyel Analiz (Lab Diff)
- **Bit Seviyesinde Karşılaştırma**: Geçmişteki herhangi iki kareyi seçerek "diff" işlemi yapın. Sistem hangi bitlerin değiştiğini tam olarak vurgular.

![Lab Diff](images/v1.2/lab_diff_live.png)

---

<a name="dsp-analysis"></a>
## 📈 DSP ve Spektral Analiz

### 📊 FFT Spektrum Analizörü
- **Dönüşüm**: Zaman düzlemindeki dalga formu verilerini **Hızlı Fourier Dönüşümü (FFT)** kullanarak frekans düzlemine dönüştürür.
- **Pencereleme Fonksiyonları**: Hanning, Hamming ve Rectangular.

![Spektral Analiz](images/v1.2/spectrum_live.png)

---

<a name="config-templates"></a>
## 📋 Yapılandırma ve Şablonlar

### 🛠️ Profil Şablon Düzenleyici (Profile Editor)
- **Görsel Ayrıştırıcı**: Kod yazmadan UART paketlerinizin yapısını tanımlayın.

![Profil Düzenleyici](images/v1.2/profile_editor_live.png)

---

<a name="validation-reporting"></a>
## 📄 Doğrulama ve Raporlama

### 📜 Doğrulama Raporu (PDF Dışa Aktarma)
- **Uyumluluk Puanlaması**: Oturumun süresine ve tespit edilen ihlal sayısına göre otomatik olarak bir "Sağlık Puanı" hesaplar.

![Doğrulama Raporu](images/v1.2/report_live.png)

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

1. **Çerçeveleme Hataları (0xFE)**: Baud hızını doğrulayın.
2. **Sync Kaybı**: Profil Editörü'ndeki "Sync Byte"ı kontrol edin.
3. **Performans**: Çok yüksek baud hızlarında donanım ivmelenmesini (GPU) aktif tutun.

---

## 🏁 Sonuç
**UART Pro Lab**, bir simülatörden daha fazlasıdır; tam bir medikal doğrulama ve sinyal mühendisliği ortamıdır.

*Mustafa Sercan Sak — Baş Mimar*
© 2026 Mustafa Sercan Sak Diagnostics
