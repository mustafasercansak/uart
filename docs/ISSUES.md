# 📋 Issue Tracker

Bu dosya proje genelindeki bilinen sorunları ve çözülen maddeleri takip eder.  
GitHub Issues açılmadan önce burada değerlendirilir.

---

## ✅ 1.6.0'da Kapatıldı

| # | Başlık | Alan |
|---|--------|------|
| 1 | SocketCAN: busy-wait sleep → `poll()` + `SO_TIMESTAMP` kernel timestamps | Rust / Performans |
| 2 | TCP Server: nonblocking+sleep(20ms) → deadlock-safe read/write stream ayrımı | Rust / Güvenilirlik |
| 3 | Serial: batching sleep(10ms) kaldırıldı | Rust / Gecikme |
| 4 | Tüm Rust eventlerine (`serial-data`, `tcp-data`, `socketcan-frame`) Rust-side timestamp eklendi | Rust |
| 5 | `Cargo.toml` edition `"2024"` → `"2021"` (geçersiz edition) | Rust / Altyapı |
| 6 | `SimulationContext` + `useSimulationEngine`: 10 Türkçe hardcoded string → i18n | i18n |
| 7 | CAN frame validation: arbitration ID range ve DLC ≤ 8 byte bounds check eklendi | Rust / Güvenlik |
| 8 | `NodeCard` + `CANProfiles`: `node.name` / `p.name` `t()` geçmiyordu — ham key gösteriyordu | i18n / UI |
| 9 | `resolveNodeName()`: `can.bed{N}{Suffix}` pattern-based dinamik çeviri — yeni node için key eklemeye gerek kalmaz | i18n / DX |
| 10 | `CANAutomationTab`: `Wait`, `Duration:`, `ms` hardcoded string → i18n | i18n |
| 11 | Rust kayıt hata mesajları Türkçe kalmış → i18n | i18n |

---

## 🔵 Açık — Hedef: 1.6.0

### TypeScript

| # | Başlık | Dosya |
|---|--------|-------|
| 12 | `as unknown as GeneratedFrame` — 2 adet gereksiz cast | `CommunicationTimeline.tsx` |
| 13 | `as unknown as GeneratedFrame` — proper type ile değiştir | `PacketInspector.tsx` |
| 14 | `displayData as unknown as Record<string, number>` — type guard ekle | `MedicalRoomScene.tsx` |
| 15 | `INITIAL_PROFILES as unknown as T[]` — generic sınırlandırma ile düzelt | `storage.ts` |
| 16 | `CANContext.tsx` Web Serial API casts — API tip tanımları iyileştirilebilir | `CANContext.tsx` |
| 17 | `tsconfig.json` `strict: true` enforce edilmiyor | Altyapı |

### Hata Yönetimi

| # | Başlık | Dosya |
|---|--------|-------|
| 18 | Tutarsız `.catch(() => {})` — silent error swallowing, en az `console.error` ekle | Çeşitli |

### Test

| # | Başlık |
|---|--------|
| 19 | Network bağlantı akışları için E2E test yok (Serial, TCP, SocketCAN) |

---

## 💡 Değerlendirme Bekleyen Fikirler

| # | Fikir |
|---|-------|
| 20 | CAN profil verilerini localStorage yerine Tauri dosya sistemine taşı (custom profiller localStorage silinince kaybolur) |
| 21 | CANAutomationTab'a loop/repeat özelliği ekle (şu an senaryo tek seferlik çalışıyor) |

---

*Son güncelleme: 2026-05-27*
