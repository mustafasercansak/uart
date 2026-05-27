# 📋 Issue Tracker

This file tracks known issues and resolved items across the project.  
Issues are evaluated here before opening on GitHub.

---

## ✅ Closed in 1.6.0

| # | Title | Area |
|---|-------|------|
| 1 | SocketCAN: busy-wait sleep → `poll()` + `SO_TIMESTAMP` kernel timestamps | Rust / Performance |
| 2 | TCP Server: nonblocking+sleep(20ms) → deadlock-safe read/write stream split | Rust / Reliability |
| 3 | Serial: redundant batching sleep(10ms) removed | Rust / Latency |
| 4 | Rust-side timestamps added to all events (`serial-data`, `tcp-data`, `socketcan-frame`) | Rust |
| 5 | `Cargo.toml` edition `"2024"` → `"2021"` (invalid edition value) | Rust / Infrastructure |
| 6 | `SimulationContext` + `useSimulationEngine`: 10 hardcoded Turkish strings → i18n | i18n |
| 7 | CAN frame validation: arbitration ID range and DLC ≤ 8 byte bounds check added | Rust / Safety |
| 8 | `NodeCard` + `CANProfiles`: `node.name` / `p.name` bypassed `t()` — raw key shown in UI | i18n / UI |
| 9 | `resolveNodeName()`: pattern-based dynamic translation for `can.bed{N}{Suffix}` — no new keys needed for additional nodes | i18n / DX |
| 10 | `CANAutomationTab`: hardcoded `Wait`, `Duration:`, `ms` strings → i18n | i18n |
| 11 | Rust recording error messages were hardcoded in Turkish → i18n | i18n |
| 12 | `CommunicationTimeline.tsx`: 2x `as unknown as GeneratedFrame` → `fields: [] as ParsedField[]`, `errors: [] as string[]` | TypeScript |
| 13 | `PacketInspector.tsx`: `as unknown as GeneratedFrame` → proper `toFrame()` mapper with `uId`/`timestampMs` mapping | TypeScript |
| 14 | `MedicalRoomScene.tsx`: `displayData as unknown as Record<string, number>` → intersection type `LiveData & Record<string, number>` | TypeScript |
| 15 | `storage.ts`: `INITIAL_PROFILES as unknown as T[]` → `load<T>(key, fallback)` optional default parameter | TypeScript |
| 16 | `CANContext.tsx`: Web Serial API casts — interfaces moved to module level; `TextDecoderStream` narrowed via `Uint8ArrayDecoder` type; unnecessary cast on `port.writable` removed | TypeScript |
| 17 | `tsconfig.json` `strict: true` — already enforced (confirmed) | Infrastructure |
| 18 | Silent `.catch(() => {})` → `console.error` added in `CANContext.tsx` SLCAN/SocketCAN writes and `SimulationContext.tsx` `list_recordings` | Error Handling |
| 19 | E2E tests for network connection flows — 14 new tests covering Serial, TCP client, TCP server, SocketCAN, WebSocket, and port validation paths | Testing |

---

## ✅ Ideas Implemented / Resolved

| # | Idea | Status |
|---|------|--------|
| 20 | Persist CAN profiles to Tauri file system | **Done** — `load_can_profiles` / `save_can_profiles` Rust commands + `initProfileStorage()` in `storage.ts`; localStorage remains fast sync cache, Tauri FS is durable mirror. `main.tsx` awaits init before first render so `loadProfiles()` stays synchronous. |
| 21 | Add loop/repeat option to CAN Automation tab | **Already existed** — `repeatCount` field + `×[N]` UI input + runner loop in `CANAutomationTab.tsx` (sequential mode, max 99 iterations). |

---

*Last updated: 2026-05-27*
