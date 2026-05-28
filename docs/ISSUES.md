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

## ✅ Closed — v1.6.0 v2 Code Review (2026-05-28)

10 findings from 7-angle automated review; all fixed in the same session.

| # | Severity | Title | Area | Resolution |
|---|----------|-------|------|------------|
| 46 | 🔴 Blocker | `connectNetwork`: `tcp://` URL stripped to `''` → silent fallback to `vcan0` instead of error | SocketCAN / UX | Fixed: reject `tcp(-server)://` URLs with an explicit error before normalization |
| 47 | 🔴 Blocker | SocketCAN read thread closes `read_fd` on fatal error but never closes `write_fd` — kernel fd leak per interface flap | Rust / Resource | Fixed: `write_fd` stored in `Arc<Mutex<…>>` shared with thread; thread closes it on exit |
| 48 | 🔴 Blocker | `CANAutomationTab`: `networkConnected`/`serialConnected` props aliased to `_unused` — send-frame steps always report `passed: true` even with no transport | Automation / Correctness | Fixed: transport state checked before `onSendFrame`; step fails with error message when no transport active |
| 49 | 🟠 High | Stale `nodeId` auto-fix silently remaps broken steps to `nodes[0]` and immediately persists to localStorage — no notification, no undo | Automation / Data Integrity | Fixed: silent remap removed; broken steps naturally fail with "node not found" at execution time |
| 50 | 🟠 High | `setOutputMode` reads `stateRef.current.serialConnected` but `stateRef` is only refreshed by `useLayoutEffect` — serial port teardown skipped in same-tick calls | Serial / Race | Fixed: dedicated `serialConnectedRef` updated synchronously in `connectSerial`/`disconnectSerial`; `setOutputMode` reads the ref |
| 51 | 🟡 Medium | `t` `useCallback` depends on `customLabels` — every `setCustomLabel` call recreates `t`, invalidating `contextValue` `useMemo`, causing all 173 `useTranslation()` consumers to re-render | Performance | Fixed: `customLabels` moved to a ref read inside `t`; `t` dep array is `[locale]` only |
| 52 | 🟡 Medium | `handleImport` fires N individual `setCustomLabel` calls — N state updates + N `localStorage.setItem` writes for a bulk import | Performance | Fixed: new `bulkSetCustomLabels` context method; import uses one atomic write |
| 53 | 🟡 Medium | `socketCANPayloadToFrame` calls `computeCANCRC` on every SocketCAN RX frame — kernel already verified CRC; wasted work at high frame rates | Performance | Fixed: SocketCAN RX frames set `crc: 0`; CRC computation skipped on the receive path |
| 54 | 🔵 Low | `LanguageProvider` fallback traversal guards with `=== undefined` not `== null` — a `null` value in a locale JSON bypasses the guard and returns the raw key path | Robustness | Fixed: guard changed to `== null` (covers both `null` and `undefined`) |
| 55 | 🔵 Low | `resolveNodeName` step-1 (`t(name) !== name`) translates any user node name that accidentally matches an i18n key | i18n / Correctness | Fixed: step-1 only fires for strings that look like i18n keys (no spaces, contains dot, starts lowercase) |

---

## ✅ Closed — v1.6.0 v3 Code Review (2026-05-28)

10 findings from 7-angle automated review; all fixed in the same session.

| # | Severity | Title | Area | Resolution |
|---|----------|-------|------|------------|
| 56 | 🔴 Blocker | Rust `write_fd` Arc race: dying read thread's `take()` closes brand-new `write_fd` stored by a concurrent `connect_socketcan` call | Rust / Race | Fixed: thread no longer closes `write_fd`; frontend `socketcan-status` error handler calls `disconnect_socketcan` to clean up; `write_fd` reverted to `Mutex` |
| 57 | 🔴 Blocker | `connectSerial` catch block dispatches `CAN_SET_SERIAL_CONNECTED: false` but never resets `serialConnectedRef` — ref permanently `true` after partial failure | Serial / State | Fixed: `serialConnectedRef.current = false` added to catch block |
| 58 | 🔴 Blocker | `contextValue` useMemo includes `customLabels` in deps — all 173 `useTranslation()` consumers still re-render on every label save, defeating the `t`-ref optimization | Performance | Fixed: split into two contexts — stable `LanguageContext` (`t`, `locale`) and `CustomLabelsContext` (`customLabels`, mutators); only Translations page subscribes to the labels context |
| 59 | 🟠 High | `disconnectNetwork` eager dispatch + Tauri event double-dispatch race: stale `connected: false` event can overwrite a new connection's `connected: true` | SocketCAN / Race | Fixed: eager dispatch removed from `disconnectNetwork`; state driven solely by the Tauri `socketcan-status` event |
| 60 | 🟠 High | `connectSerial` dispatches `CAN_SET_SERIAL_CONNECTED: true` unconditionally at start; non-Web-Serial else branch never rolls back — Redux permanently shows connected | Serial / State | Fixed: dispatch moved inside the success path; else branch dispatches `connected: false` |
| 61 | 🟡 Medium | `bulkSetCustomLabels` additive merge means importing a pruned export file cannot delete existing custom label keys | i18n / UX | Fixed: new `replaceCustomLabels` method (full replace, not merge); `handleImport` uses it |
| 62 | 🟡 Medium | `consumePendingSocketCANTx` called on every SocketCAN RX frame with no early-exit when the pending list is empty | Performance | Fixed: `if (pending.length === 0) return false` guard added |
| 63 | 🔵 Low | `setOutputMode` calls `invoke('disconnect_socketcan')` unconditionally on every mode switch even when SocketCAN was never connected | Efficiency | Fixed: guarded by `stateRef.current.networkConnected` |
| 64 | 🔵 Low | `socketcan-status` error payload never forwarded to `networkError` state — background Rust disconnect errors invisible to UI banners | State / UX | Fixed: error field forwarded in `CAN_SET_NETWORK_CONNECTED` dispatch |
| 65 | 🔵 Low | `customLabelsRef` synced via `useEffect` — 1-render stale window where `t()` reads old labels | i18n | Fixed: ref updated synchronously inside each `setCustomLabels` updater; `useEffect` removed |

---

---

## ✅ Closed — v1.6.0 v4 Code Review (2026-05-28)

10 findings from 7-angle automated review; all fixed in the same session.

| # | Severity | Title | Area | Resolution |
|---|----------|-------|------|------------|
| 66 | 🔴 Blocker | `dbcParser.ts`: `1 << i` for signals > 31 bits silently aliases bit 32 onto bit 0 — all wide signals produce corrupted values | DBC / Signal Decoding | Fixed: replaced `rawValue \|= 1 << i` with `rawValue += 2 ** i` in both LE and BE branches to avoid 32-bit JS bitwise truncation |
| 67 | 🔴 Blocker | `dbcParser.ts`: sign extension for exactly 32-bit signed signals is broken — `signBit << 1` evaluates to `0`, rawValue never sign-extended | DBC / Signal Decoding | Fixed: replaced bitmask sign extension with `if (rawValue >= halfRange) rawValue -= 2 * halfRange` using pure arithmetic |
| 68 | 🔴 Blocker | `FrameGenerator.ts`: 4-byte field accumulation via 32-bit `<<` / `\|` returns negative number when MSB is set (e.g. `0x80000000` → `-2147483648`) | Frame Generation | Fixed: applied `>>> 0` after both reduce paths to reinterpret as unsigned 32-bit |
| 69 | 🔴 Blocker | `CANFrameParser.ts`: J1939 PGN uses `dataPage << 17` — correct is `<< 16`; all Data Page 1 PGNs (`0x10000–0x1FFFF`) are doubled | CAN / J1939 | Fixed: `<< 17` → `<< 16` (PGN = DP × 65536 = 2^16) |
| 70 | 🔴 Blocker | `CANSimulationEngine.ts`: `clampCanId()` caps every ID at `0x7FF` — silently destroys 29-bit extended UDS addresses in `setUDSConfig`; J1939 UDS broken | UDS / CAN Simulation | Fixed: upper bound changed from `0x7FF` to `0x1FFFFFFF` (max 29-bit CAN ID) |
| 71 | 🟠 High | `CANSimulationEngine.ts`: `sendCustomFrame` calls `computeCANCRC(..., 'standard')` hardcoded — extended-ID frames (`> 0x7FF`) get wrong CRC | CAN Simulation | Fixed: `idFormat` derived from `arbitrationId` before the CRC call, consistent with `transmitFrame` and `transmitDiagnosticFrame` |
| 72 | 🟠 High | `CANSimulationEngine.ts`: UDS SID `0x11` (ECUReset) removed from `processUdsPayload` — returns NRC `0x11` (serviceNotSupported); `recoverNode()` never called | UDS / CAN Simulation | Fixed: SID `0x11` handler restored — replies `[0x51, subFunction]` and schedules `recoverNode()` after 100 ms |
| 73 | 🟠 High | `lib.rs`: TCP server emits `connected: true` even when `stream.try_clone()` fails — `active_stream_arc` is `None`; all subsequent writes silently fail | Rust / TCP Server | Fixed: `emit` and `read_stream = Some(stream)` moved inside the `if let Ok(write_clone)` block; a failed clone silently drops the connection and waits for the next one |
| 74 | 🟡 Medium | `CANSimulationEngine.ts`: `isotpRxSessions` map never cleared on `stop()`/`clearFrames()`; ISO-TP TX `setTimeout` chain not cancelled — stale sessions and ghost frames after reset | CAN / ISO-TP | Fixed: added `isotpTxTimers: Set<…>` to track TX timer handles; `clearTimers()` cancels all ISO-TP TX timers and clears RX sessions; `clearFrames()` does the same |
| 75 | 🔵 Low | `CANContext.tsx`: `disconnectNetwork()` relies solely on Tauri `socketcan-status` event with no synchronous fallback — UI stuck as "connected" if event is dropped (backend crash, early listener cleanup) | SocketCAN / State | Fixed: `dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: false })` added synchronously before the `invoke` call |

---

## ✅ Closed — v1.6.0 v5 Code Review (2026-05-28)

7 candidates from 7-angle automated review; 6 fixed, 1 invalidated.

| # | Severity | Title | Area | Resolution |
|---|----------|-------|------|------------|
| 76 | 🔴 Blocker | `CANContext.tsx`: `nodeId < 0` guard forwards simulated ECU diagnostic frames (`nodeId: -2`) to the real SocketCAN bus — ECU UDS responses appear as live hardware traffic | SocketCAN / Safety | Fixed: guard changed to `nodeId === -1`; only tester-injected frames reach hardware |
| 77 | 🔴 Blocker | `lib.rs`: TCP accept-loop `Err(_) => {}` arm has no sleep — persistent errors (e.g. EMFILE) spin at 100% CPU with no back-off | Rust / Reliability | Fixed: `thread::sleep(5 ms)` added to catch-all error arm |
| 78 | 🟠 High | `CANContext.tsx`: tester ISO-TP frames (FF, CF, FC) not in `pendingSocketCANTxRef` — vcan echoes show as RX instead of TX in the monitor | SocketCAN / UX | Fixed: `sendUDSRequest` pre-computes the ISO-TP breakdown and pushes all expected frames to `pendingSocketCANTxRef` before dispatching to the worker |
| 79 | 🟠 High | `canProfileStorage.ts`: `initCANProfileStorage` skips localStorage sync when `raw.length === 0` — deliberately deleted profiles are restored from stale localStorage on next launch | CAN Profiles / Persistence | Fixed: removed `&& raw.length > 0` guard; FS is always authoritative, including an empty array |
| 80 | 🟠 High | `CANSimulationEngine.ts`: `buildReadDidResponse` guard `payload.length % 2 === 0` rejects even-length payloads | UDS / CAN Simulation | **Invalid** — UDS RDBI requests are always 1 + 2N bytes (odd); an even-length payload is genuinely malformed; NRC 0x13 is correct |
| 81 | 🟡 Medium | `CANSimulationEngine.ts`: `sendUDSRequest` response-delay `setTimeout` handle not added to `isotpTxTimers` — stale UDS response fires after `stop()` / `clearFrames()` | UDS / CAN Simulation | Fixed: timer handle stored in `tid` and added to `isotpTxTimers` |
| 82 | 🟡 Medium | `CANSimulationEngine.ts`: `transmitIsoTpPayload` emits FC immediately (before FF is processed) and the timer is not tracked — cannot be cancelled by `clearFrames()` | ISO-TP / CAN Simulation | Fixed: FC emission deferred via `setTimeout(..., 0)` and handle added to `isotpTxTimers` |

---

*Last updated: 2026-05-28*
