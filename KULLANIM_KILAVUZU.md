# UART Sensör Simülatörü — Detaylı Kullanım Kılavuzu

UART Sensör Simülatörü, gömülü sistem (embedded) geliştiren mühendislerin geliştirme ve test süreçlerini hızlandırmak amacıyla tasarlanmıştır. Çeşitli sensörlerin verilerini (DS18B20, DHT22, MPU6050, EKG, SpO₂ vb.) karmaşık senaryolarla simüle edebilir ve üretilen veri paketlerini **Web Serial API** üzerinden doğrudan bilgisayarınızın fiziksel veya sanal COM portlarına aktarabilir.

## 1. Sisteme Giriş ve Arayüz
Uygulama arayüzü 4 ana bölüme ayrılmıştır:
1. **Üst Kontrol Çubuğu:** Profil seçimi, Çıkış Modu ve Simülasyon kontrolleri.
2. **Canlı Frame Monitörü (Sol Üst):** Üretilen raw hex byte'larının ve yapısal alanların anlık durumunu izleme.
3. **Dalga Formu & Grafik Monitörü (Sol Alt):** `waveform` (dalga formu) ve `range` (aralık) tipi sensör verilerinin zaman içerisindeki çizgi grafik hali.
4. **Hata Enjeksiyonu ve Override Paneli (Sağ):** Üretilen verilere anlık manuel müdahale ve bit manipülasyonları.

---

## 2. Seri Port (COM) Üzerinden Donanıma Bağlantı

Bu uygulamanın en güçlü özelliklerinden biri, hiçbir aracı sunucu / masaüstü yazılımı kurmanızı gerektirmeden, **tarayıcı üzerinden donanımınıza doğrudan bağlanabilmesidir**. (Web Serial API teknolojisi sayesinde)

### Bağlantı Adımları
1. Öncelikle uygulamanın sol üst kısmındaki **Profil** açılır menüsünden çalıştırmak istediğiniz profil bilgisini (Örn: *DS18B20 - ASCII* veya *Masimo Sağlık Sensörü*) seçin.
2. Çıkış Türü menüsünden **Seri Port** seçeneğini seçin.
3. Menünün hemen yanında belirecek olan **"Bağlan"** isimli mavi butona tıklayın.
4. Tarayıcınız (Chrome veya Edge) size bilgisayarınızdaki erişilebilir COM portlarının küçük bir listesini açacaktır. **Test yapacağınız cihazın (veya sanal USB-TTL çeviricinin) COM portunu seçin** ve onaylayın.
5. Bağlantı başarılı olduğunda yeşil renkle `Bağlı` ibaresi çıkacaktır.
6. Son olarak, sağ taraftaki **"▶ Başlat"** butonuna basarak simülasyonu başlatabilirsiniz. Sensör formatınıza göre Byte'lar veya ASCII satırları, baud ve mikrosaniye kuralını aşmadan doğrudan seçtiğiniz porta akacaktır.

> **İPUCU:** Çıkış Türünü **Yalnızca Log** olarak seçerek hiçbir COM porta bağlanmadan verileri sadece yazılımsal osiloskopta (arayüzde) simüle edebilir ve senaryonuzu görsel olarak test edebilirsiniz.

---

## 3. Sensör Profilleri ve Yapılandırma
Profiller, bir UART veri paketinin (Frame) yapısını tanımlar. Uygulama içinde hazır gelen bazı gelişmiş profiller:
- **YS2000A / BM1000:** 8-byte'lık tıbbi standartta plet (dalga) ve SpO2 verisi.
- **Masimo / Nellcor Benzeri Modüller:** Binary paket yapıları.
- **ASCII Sensörler:** DS18B20 gibi okunabilir metin tabanlı veriler.

Örneğin bir binary pakette sırasıyla:
- `Sync Byte` (Sabit, Örn: `0xAA` veya `0x01`)
- `Sensor ID` (Checksum hariç)
- `Değer (High Byte)`
- `Değer (Low Byte)`
- `Checksum (CRC16 veya XOR)`
gibi birbirinden farklı tiplerde parçalar "Field" (Alan) olarak yaratılır. Her field'ın Endianness (Big/Little) ayarı ayrı ayrı değiştirilebilir.

---

## 4. Senaryo Yönetimi ve Dinamik Müdahale (Scenario Engine)

Sistemi gerçekçi kılan ana özellik, bir senaryo atanabilmesidir.
- Seçtiğiniz profile **Senaryo Yok** derseniz, sensörler normal stabil değerlerinde standart sapmalarla rastgele veri üretir.
- Eğer özel bir senaryo atarsanız, belirli süre (ms) geçtikçe olaylar tetiklenir: 
  * "10. saniyede Sıcaklık değerini bir rampa ile 5 saniyede 100°C'ye çıkar."
  * "15. saniyede Sensör Bağlantı Koptu (Flags içindeki `sensor_fault` bitini 1 yap) sinyali gönder."
  * "20 saniye sonra ardışık 3 pakette Checksum'ı bilerek boz."

### Anlık Manuel (Override) Müdahaleler
Sağ panelde yer alan kısımdan, senaryo işlerken dahi sisteme elle müdahale edilebilirsiniz:
- **Range / Dalga Slider'ları:** Çalışan bir verinin ortalama/anlık değerini paketin periyodik akışını bozmadan değiştirebilirsiniz.
- **Bit Flag Toggle (Bayrak):** Çeşitli makine durumu bit'lerini (örneğin Alarm Biti, Şarj Oluyor Biti) anlık olarak 1 veya 0'a çekebilirsiniz. Değişiklik anında oluşturulacak ilk frame'in içine yansır.

---

## 5. Hata Enjeksiyon Sistemi

Karşılayıcı yazılımınızın (işlemcinizin veya sinyal analizörünüzün) dayanıklılığını (Robustness) test etmek için, giden sinyali **programlı olarak bozabilirsiniz**.

Sağ alttaki **Hata Enjeksiyonu** panelinden aşağıdaki hataları tetikleyebilirsiniz:
* `Checksum Boz`: Paketin en sonunda veya belirlenen alanında hesaplanan sağlamanın bilerek yanlış hesaplanmış versiyonunu yollar.
* `Yanlış Sync`: Paketin başlangıç Magic Word (Sync Byte) değerini rastgele başka bir byte ile değiştirir.
* `Byte Atla (Drop)`: Rastgele frame'lerin arasında iletişim koptu efekti yaratmak için bazı field'ların gönderilmesini pas geçer. Paket boyutu eksilir.
* `Ekstra Byte (Noise)`: Frame aralarına anlamsız Hex byte'ları enjekte eder. Alıcı FIFO tamponlarının taşmasını veya senkronizasyon kayıplarını test etmek içindir.
* `Frame Gecikmesi`: Sistem gecikmesi (latency) yaratır; sonraki paketin gönderilme periyoduna suni bir `delay` atar ki alıcınızdaki Timeout (Zaman Aşımı) rutinleri test edilebilsin.

> **ÖNEMLİ:** Verilerin gidiş anında tetiklenen bu hataların hangisinin tam olarak hangi ms'de gittiğini sayfanın altındaki "Konsol" loglarından öğrenebilirsiniz. Kırmızı kayıtlar kasıtlı olarak bozulan paketleri belirtir.

## 6. Sıkça Sorulan Sorular (SSS)
- **Cihazıma bağlandım fakat veri gelmiyor/anlamsız geliyor?**
  Cihazınızın baudrate yapılandırmasının, sol üst açılır menüden seçilen 'Profil'in Baud Rate'iyle (örn: 115200) eşleştiğinden emin olun. Veri stop bit ve parity değerlerini profile uygun yapılandırın.
- **Chrome harici tarayıcılarda çalışır mı?**
  Çoğunlukla sadece uyumlu Chromium tabanlı tarayıcılarda (Google Chrome, Microsoft Edge, Opera, Brave) port donanım erişim izinleri olan `Web Serial API` mevcuttur. Safari ve Firefox henüz bu donanım akışını desteklemez.
- **Performansım düşüyor mu?**
  Arayüz son 500 frame logunu görselleştirir, eski verileri siler. Aşırı yoğun (örn: 1ms) aralıklarla seri port aktarımlarında düşük profilli bilgisayarlarda yavaşlama olabilir. Minimum 20ms standart endüstriyel frekanslarda çalışılması önerilir.
