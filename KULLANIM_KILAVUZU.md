# 🚀 UART Sensör Simülatörü — Kapsamlı Kullanım Kılavuzu

UART Sensör Simülatörü; **tıbbi cihazlar**, **endüstriyel sensörler** veya **IoT modülleri** ile çalışan gömülü sistem mühendisleri için tasarlanmış gerçek zamanlı bir veri üretim ve analiz platformudur. 

![UART Simülatörü Canlı Çalışma Ekranı](/docs/images/dashboard.png)

---

## ⚡ Temel Kullanım: 3 Adımda Veri Gönderimi

### 1. Profil ve Protokol Seçimi
Sol üst menüden simüle etmek istediğiniz cihazı seçin. Her profil, kendine has bir veri paket yapısı (frame), baud hızı ve iletim periyoduna sahiptir.

![Profil Seçim Menüsü](/docs/images/profiles.png)

### 2. Çıkış Modu (Output Mode)
- **Log Modu**: Herhangi bir donanım gerektirmez. Veriyi sadece uygulama içindeki grafiklerde ve log konsolunda izleyebilmenizi sağlar.
- **Seri Port Modu**: Bilgisayarınıza bağlı bir USB-TTL dönüştürücü veya sanal bir COM port üzerinden gerçek dünyaya veri basar.

### 3. Başlat & İzle
**"▶ Başlat"** butonuna bastığınızda durum göstergesi yeşile döner ve veri paketleri milisaniyelik hassasiyetle akmaya başlar.

---

## 🔬 Gelişmiş Modüller

### 🛡 Hata Enjeksiyonu (Fault Injection)
Gerçek saha koşullarını test etmek için veriye anlık müdahale edin. Sağ paneldeki butonları kullanarak:
- **Checksum Boz**: Paketlerin doğrulama kodlarını hatalı hesaplar.
- **Yanlış Sync**: Başlangıç/Bitiş byte'larını değiştirerek senkron kayması yaratır.
- **Byte Atla/Ekle**: Veri bütünlüğünü bozup alıcı cihazın hata toleransını ölçer.

![Hata Enjeksiyon Kontrolü](/docs/images/faults.png)

### 🧪 Scripting & LAB
Dahili JavaScript motoru ile kendi simülasyon kurallarınızı yazın. Lab sekmesinde, çalışan simülasyona matematiksel formüller veya rastgelelik ekleyerek daha karmaşık test senaryoları oluşturabilirsiniz.

![Lab Betik Düzenleyici](/docs/images/lab_code.png)

### 📊 Tanılama (Diagnostics)
Zamanlama kaymalarını (Jitter) ve paketler arası gecikmeyi milisaniye düzeyinde takip edin. Bu ekran, seri iletişimin stabilitesini ölçmek için idealdir.

![Tanılama Verileri](/docs/images/diagnostics.png)

---

## 📼 Kayıt ve Oynatma (Playback)
Simülasyon seanslarınızı kaydedin ve daha sonra **Playback** sekmesinden saniye saniye, hatta kare kare (frame-by-frame) tekrar oynatarak analiz edin.

![Playback Kontrol Merkezi](/docs/images/playback.png)

---

## 🔬 Seviye 4: Donanım Teşhis & Mantık Analizörü (Logic Analyzer)

Derin donanım hata ayıklaması için Pro Suite, yüksek performanslı bir **Bit Seviyesinde Mantık Analizörü** içerir.
- **Zamanlama Hassasiyeti:** Mikrosaniye (µs) seviyesinde bit geçiş takibi.
- **Ölçüm İmleçleri:** A ve B imleçlerini sürükleyerek bit geçişleri arasındaki kesin süreyi (ΔT) ve frekansı ölçün.
- **Protokol Çözümleme:** UART TX hatları için START, DATA ve STOP bit etiketleri ile donatılmış özel donanım izleri.

![Donanım Teşhis Analizörü](/docs/images/pro_logic.png)

---

© 2026 Mustafa Sercan Sak
