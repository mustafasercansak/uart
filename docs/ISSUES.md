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

---

## 🔵 Open — Target: 1.6.0

### TypeScript

| # | Title | File |
|---|-------|------|
| 12 | `as unknown as GeneratedFrame` — 2 unnecessary casts | `CommunicationTimeline.tsx` |
| 13 | `as unknown as GeneratedFrame` — replace with proper type | `PacketInspector.tsx` |
| 14 | `displayData as unknown as Record<string, number>` — add type guard | `MedicalRoomScene.tsx` |
| 15 | `INITIAL_PROFILES as unknown as T[]` — fix with generic constraint | `storage.ts` |
| 16 | `CANContext.tsx` Web Serial API casts — improve API type definitions | `CANContext.tsx` |
| 17 | `tsconfig.json` `strict: true` not enforced | Infrastructure |

### Error Handling

| # | Title | File |
|---|-------|------|
| 18 | Inconsistent `.catch(() => {})` — silent error swallowing, add at least `console.error` | Various |

### Testing

| # | Title |
|---|-------|
| 19 | No E2E tests for network connection flows (Serial, TCP, SocketCAN) |

---

## 💡 Ideas Under Consideration

| # | Idea |
|---|------|
| 20 | Persist CAN profiles to Tauri file system instead of localStorage (custom profiles are lost on localStorage clear) |
| 21 | Add loop/repeat option to CAN Automation tab (scenarios currently run once) |

---

*Last updated: 2026-05-27*
