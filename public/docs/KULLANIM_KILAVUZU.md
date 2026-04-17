# UART PRO LAB - Mühendislik Laboratuvarı Rehberi

**UART Pro Lab**'a hoş geldiniz. Burası, yüksek hassasiyetli gömülü sistem protokol geliştirmeleri ve fiziksel katman simülasyonları için tasarlanmış profesyonel bir teşhis ortamıdır.

![Profesyonel Laboratuvar Paketi](/docs/images/hero.png)

---

## 🚀 Seviye 1: Akıllı Protokol Çözücüler
Pro Lab, endüstri standardı çerçeveleme (framing) protokollerini destekleyen gelişmiş bir **Paketleme Motoru** içerir. Bu sayede simüle edilen veriler, gerçek dünya donanım uygulamalarıyla tam uyumlu olur.

### Desteklenen Çerçeveleme Modları:
- **SLIP (Serial Line IP)**: Paket sonu için `0xC0`, kaçış karakteri için `0xDB` kullanır. TCP/IP-over-Serial uygulamaları için idealdir.
- **COBS (Consistent Overhead Byte Stuffing)**: Veri akışındaki tüm 0x00 baytlarını temizleyerek, özel karakter kullanmadan güvenilir paket sınırları sağlar.
- **Modbus RTU**: Her pakete otomatik olarak **CRC16** (Döngüsel Artıklık Denetimi) hesaplayıp ekleyerek veri bütünlüğünü garanti eder.

> [!TIP]
> Protokoller arası geçiş yapmak için **Profil Düzenleyici (Profile Editor)**'deki **Framing** sekmesine gidin ve istediğiniz motoru seçin.

![Akıllı Çözücü Arayüzü](/docs/images/pro_decoders.png)

---

## 🔬 Seviye 2: Sinyal Bütünlüğü Laboratuvarı
Fiziksel iletişim hatlarının zorlu gerçeklerini simüle edin. Bu laboratuvar, MCU yazılımınızın anlık kesintileri ve zamanlama kaymalarını nasıl yönettiğini test etmenize olanak tanır.

### Laboratuvar Kontrolleri:
- **Gürültü Enjeksiyonu (Noise)**: Veri baytlarına rastgele Gauss gürültüsü karıştırır.
- **Mikro-Jitter**: Paket varış zamanlarındaki kaymaları simüle ederek RX tampon (buffer) senkronizasyonunuzu zorlar.
- **Bit-Flipping**: Elektromanyetik parazitleri (EMI) simüle etmek için paket içindeki bitleri rastgele tersler.

![Sinyal Bütünlük Kalibrasyonu](/docs/images/pro_integrity.png)

---

## 🎨 Seviye 3: Dijital İkiz ve Dashboard Tasarımcısı
Ham verileri, sürükle-bırak tasarımcıyı kullanarak bir "Görev Kontrol" paneline (HUD) dönüştürün. Cihazınızın dijital bir ikizini oluşturun.

### Kendi HUD Panelinizi Nasıl Oluşturursunuz?
1. **İğneleme (Pinning)**: **Packet Dissector** panelinde, herhangi bir veri alanının yanındaki **İğne (📌)** ikonuna tıklayın.
2. **Widget Seçimi**: **Anlık Grafikler**, **Analog Kadranlar**, **Durum LED'leri** veya **7-Segment Göstergeler** arasından seçiminizi yapın.
3. **Yerleşim**: Widget'ları sürükleyerek paneli düzenleyin. Yerleşiminiz otomatik olarak kaydedilir ve sunucuyla senkronize edilir.

![Dashboard Tasarımcısı ve HUD](/docs/images/pro_designer.png)

---

## ⏺ Profesyonel Kayıt ve Oynatma
- **Kayıt**: Teşhis oturumlarını mikrosaniye hassasiyetinde zaman damgalarıyla kaydedin.
- **Zaman Yolculuğu**: Geçmiş veriler arasında gezinmek için **Playback** sekmesini kullanın ve kare kare (frame-by-frame) ilerleyerek hata noktalarını saptayın.

---
**Geliştirici:** Mustafa Sercan Sak | Simulation Engine v2.0
