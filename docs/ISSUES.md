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

## ✅ Closed — v1.6.0 Pre-Release Code Review (2026-05-28)

All 15 findings from the 9-angle + gap-sweep review resolved in the same release.

| # | Title | Area | Resolution |
|---|-------|------|------------|
| 22 | Motorola `bitIdx` formula bit-reverses every byte — all multi-byte DBC signals wrong | DBC / Signal Decoding | Fixed: `7 - (bitPos % 8)` → `bitPos % 8` |
| 23 | `parseFloat(factor) \|\| 1` corrupts legitimate DBC factor of `0` | DBC / Signal Decoding | Fixed: explicit `isNaN` guard |
| 24 | Simulation frames flood real SocketCAN bus on connect | SocketCAN / Safety | Fixed: only `nodeId < 0` (manual) frames forwarded to hardware |
| 25 | `frameCount++` twice in `transmitFrame()` — counter always 2× | CAN Simulation | Fixed: duplicate removed |
| 26 | `transmitFrame` / `transmitDiagnosticFrame` hardcode `'standard'` CRC for extended-ID nodes | CAN Simulation | Fixed: `idFormat` derived from arbitration ID |
| 27 | `canProfileStorage.ts` localStorage key `'can_profiles'` never synced to Tauri FS | CAN Profiles / Persistence | Fixed: `initCANProfileStorage()` + `save_can_profiles` on every write |
| 28 | DBC parser clamps DLC to min 1 — valid `DLC=0` frames silently promoted | DBC / Parser | Fixed: `Math.max(0, dlc)` |
| 29 | SLCAN parser loops past `dataHex.length` — injects `NaN` into byte arrays | SLCAN / Serial | Fixed: loop bounded to `min(dlc, floor(dataHex.length/2))` with NaN guard |
| 30 | `write_tcp_server` holds mutex during `write_all` — deadlocks on client disconnect | TCP Server / Rust | Fixed: stream cloned out of mutex before write |
| 31 | `write_fd` overwritten without `close()` on SocketCAN reconnect — fd leak | SocketCAN / Rust | Fixed: old fd closed before replacement |
| 32 | `setOutputMode` never closes serial port handle — OS resource leak | Serial / Cleanup | Fixed: reader/writer/port explicitly closed on mode switch |
| 33 | `clearFrames()` leaves `state.status` as `'running'` — controls silently no-op | CAN Simulation / State | Fixed: `CAN_SET_STATUS: 'stopped'` dispatched |
| 34 | `loadCANProfiles()` casts `JSON.parse` without `Array.isArray` — crash on corrupted storage | CAN Profiles / Robustness | Fixed: validation with fallback to defaults |
| 35 | `connectNetwork` passes `tcp-server://` verbatim to SocketCAN — TCP server never starts | Network / CAN Dashboard | Fixed: `tcp(-server)?://` prefix stripped |
| 36 | `list_recordings` reads full JSON of every recording just for frame count — blocks Tauri thread | Recordings / Rust | Fixed: lightweight `.meta.json` sidecar written at save; `list_recordings` reads sidecar only |

---

## ✅ Closed — v1.6.0 i18n / Translations Code Review (2026-05-28)

9 findings from 7-angle automated review; all fixed in the same session.

| # | Severity | Title | Area | Resolution |
|---|----------|-------|------|------------|
| 37 | 🔴 Blocker | `EditNodeModal`: `resolveNodeName()` result written back on save — i18n key permanently destroyed | i18n / Data Integrity | Fixed: preserve original `node.name` when display text is unchanged |
| 38 | 🔴 Blocker | `CANProfiles` `nodeToForm`: same silent key destruction via `resolveNodeName()` | i18n / Data Integrity | Fixed: same pattern — compare resolved text before overwriting key |
| 39 | 🔴 Blocker | `LanguageProvider`: no `useMemo` on context value — all 173 `useTranslation()` consumers re-render on every label save | Performance | Fixed: context value wrapped in `useMemo` |
| 40 | 🟠 High | `loadCustomLabels`: `{ en:{}, tr:{}, ...parsed }` allows `null` locale — `resetCustomLabel` throws `TypeError` | Robustness | Fixed: null-guard after spread |
| 41 | 🟡 Medium | `handleResetAll`: N separate `localStorage.setItem` calls (one per key) instead of one bulk write | Performance | Fixed: new `resetCustomLabelsForNamespace` bulk action |
| 42 | 🟡 Medium | `handleBlur`: fires `setCustomLabel` on innocent focus/blur with no change — spurious writes and re-renders | Performance | Fixed: early return when value equals stored custom label |
| 43 | 🔵 Low | `applyParams`: `new RegExp('{' + key + '}', 'g')` — unescaped key throws `SyntaxError` for metachar param names | Robustness | Fixed: replaced with `split`/`join` |
| 44 | 🔵 Low | `Translations` table column headers use translated text as React `key` — duplicate translation collapses a column | UI | Fixed: stable identifier string used as key |
| 45 | 🔵 Low | `LabelsEditorModal.tsx`: dead code — zero imports after Tag button changed to navigate | Maintenance | Fixed: file deleted |

---

*Last updated: 2026-05-28*
