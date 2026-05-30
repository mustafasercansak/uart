# 📜 UART Sensor Simulator — Changelog

All notable milestones of the UART Sensor Simulator's evolution toward a "Medical Simulation & Certification Suite" are tracked in this file.

## [Unreleased]

---

## [v1.6.0] — 2026-05-28 (patch)
### 🔧 v3 Code Review Fixes

#### Bug Fixes
- **Rust `write_fd` Arc race on fast reconnect** (`lib.rs`): The previous fix shared `write_fd` via `Arc` with the read thread so it could close the fd on error exit. This introduced a race: if `connect_socketcan` stored a new `write_fd` before the dying thread's `Arc::take()` ran, the thread would steal and close the brand-new fd, silently breaking the next connection. Reverted to a plain `Mutex`; the frontend `socketcan-status` error handler now calls `invoke('disconnect_socketcan')` to clean up `write_fd` safely after an interface error.
- **`connectSerial` partial-failure leaves `serialConnectedRef` permanently `true`** (`CANContext.tsx`): If `port.open()` succeeded (setting `serialConnectedRef = true`) but a later step threw, the catch block dispatched `CAN_SET_SERIAL_CONNECTED: false` but never reset `serialConnectedRef`. Every subsequent `setOutputMode` call would attempt serial teardown against null refs indefinitely. Fixed: `serialConnectedRef.current = false` added to the catch block.
- **`connectSerial` optimistic dispatch with no rollback on non-Web-Serial platforms** (`CANContext.tsx`): `CAN_SET_SERIAL_CONNECTED: true` was dispatched unconditionally at the top of `connectSerial` before checking `'serial' in navigator`. On platforms without Web Serial the else branch logged a warning and returned without rolling back, leaving Redux permanently showing `serialConnected: true`. Fixed: dispatch moved to after `port.open()` succeeds; else branch dispatches `connected: false`.
- **`disconnectNetwork` + Tauri event double-dispatch race** (`CANContext.tsx`): `disconnectNetwork` immediately dispatched `CAN_SET_NETWORK_CONNECTED: false`, then the Tauri `socketcan-status` event fired and dispatched `false` again. If `connectNetwork` was called between the two, the stale second dispatch overwrote the new `connected: true`, leaving the UI showing disconnected while hardware was connected. Fixed: eager dispatch removed from `disconnectNetwork`; state now driven solely by the `socketcan-status` Tauri event.
- **`socketcan-status` error payload discarded — `networkError` state never populated** (`CANContext.tsx`): Background Rust disconnect errors were logged to the activity log but the `error` field was never forwarded to the reducer, so `state.networkError` stayed `null` and any error-banner UI had no data to show. Fixed: error field forwarded in the `CAN_SET_NETWORK_CONNECTED` dispatch.

#### Performance Fixes
- **`contextValue` `useMemo` included `customLabels` — all 173 `useTranslation()` consumers still re-rendered on every label save** (`LanguageProvider.tsx`): Despite `t` being stabilised with a ref, `customLabels` in the `contextValue` dep array produced a new context object on every mutation, propagating re-renders to all subscribers. Fixed by splitting into two separate React contexts: a stable `LanguageContext` (`t`, `locale`, `setLocale`) that only changes on locale switch, and a `CustomLabelsContext` (`customLabels` + mutators) that only the Translations page subscribes to.
- **`customLabelsRef` synced via `useEffect` — 1-render stale window in `t()`** (`LanguageProvider.tsx`): The `useEffect` that kept `customLabelsRef` in sync with state ran after paint, so `t()` read old labels in the render immediately following a save. Fixed: `customLabelsRef.current = next` is now assigned synchronously inside each `setCustomLabels` functional updater; the `useEffect` is removed.
- **`consumePendingSocketCANTx` called on every SocketCAN RX frame with no empty-list guard** (`CANContext.tsx`): On a receive-only bus with 1000+ fps the function ran a full backwards expiry loop + `findIndex` scan on every frame even when the pending list was empty. Fixed: early `if (pending.length === 0) return false` guard.
- **`setOutputMode` called `invoke('disconnect_socketcan')` unconditionally** (`CANContext.tsx`): Every output-mode switch fired a Tauri IPC round-trip to disconnect SocketCAN even when it was never connected. Fixed: guarded by `stateRef.current.networkConnected`.

#### UX / Correctness
- **`bulkSetCustomLabels` additive merge broke import-as-replace** (`LanguageProvider.tsx` + `Translations/index.tsx`): Importing a pruned export file left deleted keys in storage because the merge spread `prev` over `overrides`. Added `replaceCustomLabels` (full replace, not merge); `handleImport` now uses it so a pruned import file actually removes the absent keys.

---

## [v1.6.0] — 2026-05-28 (patch)
### 🔧 v2 Code Review Fixes

#### Bug Fixes
- **`connectNetwork` silently fell back to `vcan0` on TCP URLs** (`CANContext.tsx`): Passing a `tcp://` or `tcp-server://` URL stripped it to an empty string and triggered the `|| 'vcan0'` fallback with no error. Now rejected up-front with an explicit error log entry.
- **SocketCAN `write_fd` leaked after interface error** (`lib.rs`): When the read thread exited due to a fatal poll/recv error (e.g. `ip link del vcan0`), it closed `read_fd` but left `write_fd` open in the shared state. Fixed by sharing `write_fd` via `Arc<Mutex<…>>`; the thread now closes it on exit alongside `read_fd`.
- **Automation send-frame steps always passed** (`CANAutomationTab.tsx`): `networkConnected` and `serialConnected` props were aliased to unused underscore vars; send-frame steps called `onSendFrame` and recorded `passed: true` even when no serial port or network was active. Both props are now tracked via `transportRef` and checked before executing the step — reports `passed: false` with a clear `autoNoTransport` message when inactive.
- **Stale automation `nodeId` silently remapped to `nodes[0]`** (`CANAutomationTab.tsx`): A `useEffect` watching `nodes` changes automatically reassigned any broken step to `nodes[0]` with no user notification and immediately persisted the corrupted profile to localStorage. The silent remap is removed; steps with stale node IDs now fail gracefully at execution time with "node not found".
- **`setOutputMode` skipped serial teardown due to stale ref** (`CANContext.tsx`): `setOutputMode` read `stateRef.current.serialConnected` to decide whether to close the port, but `stateRef` is only refreshed after the next render via `useLayoutEffect`. If `connectSerial` and `setOutputMode` ran in the same synchronous batch the flag was still `false`, leaving the serial port open. Added a dedicated `serialConnectedRef` updated synchronously in `connectSerial`, `disconnectSerial`, and `setOutputMode`.
- **`LanguageProvider` fallback `null` guard used `=== undefined`** (`LanguageProvider.tsx`): The locale JSON fallback traversal checked `=== undefined` but not `=== null`, so a `null` value in a locale file bypassed the guard and caused `t()` to return the raw dotted key. Changed to `== null`.
- **`resolveNodeName` mis-translated user-created node names** (`nodeNameResolver.ts`): Step-1 (`t(name) !== name`) was applied unconditionally — any user node name that happened to match an i18n key (e.g. `can.defibrillator`) was silently replaced with its translation. Now restricted to strings that look like i18n keys: no spaces, contains a dot, starts lowercase.

#### Performance Fixes
- **`t()` recreation defeated `contextValue` `useMemo`** (`LanguageProvider.tsx`): `t` was defined with `useCallback([locale, customLabels])`; every `setCustomLabel` call created a new `customLabels` reference, recreating `t` and invalidating the `useMemo` on `contextValue` — causing all 173 `useTranslation()` consumers to re-render on every keystroke in the Translations page. `t` now reads `customLabels` via a `customLabelsRef`, its dep array is `[locale]` only, and label saves no longer propagate to consumers.
- **`handleImport` fired N state updates** (`Translations/index.tsx`): Importing a JSON file called `setCustomLabel` once per key, causing N sequential React re-renders and N `localStorage.setItem` calls. Added `bulkSetCustomLabels(overrides)` to the context; import now performs one atomic state update and one storage write.
- **`computeCANCRC` called on every SocketCAN RX frame** (`CANContext.tsx`): The kernel driver already validates the CRC before delivering frames to userspace; running the full 15-bit polynomial in JS on every received frame was pure overhead. `socketCANPayloadToFrame` now sets `crc: 0` for SocketCAN RX frames.

---

## [v1.6.0] — 2026-05-28 (patch)
### 🔧 i18n / Translations Code Review Fixes

#### Bug Fixes
- **`EditNodeModal` name round-trip broken** (`EditNodeModal.tsx`): When saving, the node name was taken from the display-resolved string rather than the original i18n key, permanently converting keys like `can.oRMonitor` to plain text and breaking future locale switching. Now tracks `resolvedOriginalName` and writes back the original key if the user made no change.
- **`CANProfiles` `commitEditNode` same issue** (`CANProfiles/index.tsx`): `commitEditNode` compared `patch.name` to the raw form value; identical fix — restores the original i18n key when the user leaves the name unchanged.
- **`applyParams` unsafe with regex metachar keys** (`LanguageProvider.tsx`): The param substitution used `new RegExp('{' + key + '}', 'g')`, which throws a `SyntaxError` for any param whose name contains a regex metacharacter. Replaced with a safe `split`/`join` approach.
- **`loadCustomLabels` null locale crash** (`customLabels.ts`): After the spread `{ en: {}, tr: {}, ...parsed }`, a stored `null` value for `en` or `tr` passed straight through as `null`. Added an explicit `typeof === 'object'` guard so malformed localStorage data falls back to `{}`.

#### Performance Fixes
- **Mass re-render on every label save** (`LanguageProvider.tsx`): The context value object was re-created on every render, causing all 173 `useTranslation()` consumers to re-render after each `setCustomLabel` call. Wrapped context value in `useMemo`.
- **N `localStorage.setItem` writes on "Reset All"** (`Translations/index.tsx` + `LanguageProvider.tsx`): The previous `handleResetAll` called `resetCustomLabel` in a `forEach` loop, triggering one state update and one storage write per key. Added `resetCustomLabelKeys(keys[])` bulk method that does a single state update and a single write regardless of namespace size.

#### Code Quality
- **`handleBlur` no-op saves** (`Translations/index.tsx`): Blurring an unmodified input fired `setCustomLabel` unnecessarily. Added early-return guard `if (trimmed === stored) return`.
- **Column headers used translated text as React keys** (`Translations/index.tsx`): Column header `key` prop used the translated string, which changes with locale and can collide. Changed to stable identifier strings (`'colKey'`, `'colDefaultEn'`, etc.).
- **`LabelsEditorModal` dead code** (`LabelsEditorModal.tsx`): After the Tag button was changed to navigate to `/translations`, the modal had zero import sites. File deleted.

---

## [v1.6.0] — 2026-05-28 (patch)
### 🐛 Pre-Release Bug-Fix Pass (Code Review)

#### Critical Fixes
- **DBC Motorola signal decoding wrong** (`dbcParser.ts`): The big-endian bit-extraction formula used `7 - (bitPos % 8)` instead of `bitPos % 8`, bit-reversing every byte of every multi-byte Motorola/big-endian signal. All multi-byte signals (temperature, RPM, speed…) now decode to correct physical values.
- **DBC signal `factor=0` corrupted** (`dbcParser.ts`): `parseFloat(factor) || 1` replaced a legitimate zero factor with `1` due to JS falsy coercion. Fixed with an explicit `isNaN` check so factor=0 is preserved.
- **DBC `DLC=0` rejected** (`dbcParser.ts`): `Math.max(1, dlc)` promoted valid DLC=0 messages (NMT heartbeat, keep-alive frames) to DLC=1. Changed to `Math.max(0, dlc)`.
- **Simulation flooding real SocketCAN bus** (`CANContext.tsx`): Every simulation-generated node frame was forwarded to the live CAN bus when SocketCAN was connected. Now only manually-sent frames (`nodeId < 0`) are written to hardware; periodic simulation traffic stays internal.
- **`frameCount` double-incremented** (`CANSimulationEngine.ts`): `this.state.frameCount++` appeared twice in `transmitFrame()`, making the counter always report 2× the real value. Duplicate removed.
- **Extended-ID nodes get wrong CRC and `idFormat`** (`CANSimulationEngine.ts`): `transmitFrame` and `transmitDiagnosticFrame` hardcoded `'standard'` for CRC computation and frame format regardless of the arbitration ID. Both now derive `idFormat` from the actual ID value (`> 0x7ff → 'extended'`) and pass it to `computeCANCRC`. Bus-load estimation also corrected for extended frames.

#### High-Severity Fixes
- **CAN profiles not persisted to disk** (`canProfileStorage.ts`): Profiles were written to localStorage key `'can_profiles'` which the Tauri FS layer never reads. Added `initCANProfileStorage()` (called in `main.tsx` before first render), `invoke('save_can_profiles')` calls in `saveCANProfile` / `deleteCANProfile`, and first-run FS seeding. Profiles now survive app reinstalls.
- **`canProfileStorage` JSON not validated as array** (`canProfileStorage.ts`): `JSON.parse` result was cast without `Array.isArray` check; a corrupted storage value crashed `saveCANProfile` on `.findIndex`. Added validation with fallback to defaults.
- **SLCAN parser injects `NaN` bytes** (`CANContext.tsx`): The SLCAN frame loop ran `dlc * 2` iterations without bounding to `dataHex.length`; malformed frames with DLC > actual hex data pushed `NaN` values into the byte array. Now clamped to `Math.min(dlc, floor(dataHex.length / 2))` with explicit NaN guard.
- **TCP server deadlock on client disconnect** (`lib.rs`): `write_tcp_server` held `active_stream` mutex for the entire duration of `write_all`. If the remote client disconnected mid-write the accept-loop thread deadlocked on the same mutex. Fixed by cloning the stream out of the mutex before writing.
- **`clearFrames()` leaves status as `'running'`** (`CANContext.tsx`): The engine was stopped but UI status stayed `'running'`, making subsequent start/pause/resume silently no-op. Added `CAN_SET_STATUS: 'stopped'` dispatch.
- **`setOutputMode` leaks serial port handle** (`CANContext.tsx`): Switching output mode cleared the `serialConnected` flag but never closed the physical Web Serial port. The background reader loop kept running and held the OS port handle. Now explicitly closes reader, writer, and port before dispatching the flag change. Also disconnects SocketCAN when switching away from tcp mode.
- **SocketCAN `write_fd` leaked on reconnect** (`lib.rs`): `connect_socketcan` overwrote `state.write_fd` without closing the previous fd, leaking a file descriptor on each reconnect that bypassed `disconnect_socketcan`. Old fd is now closed before replacement.
- **`connectNetwork` ignores `tcp-server://` prefix** (`CANContext.tsx`): Passing a `tcp-server://` URL forwarded it verbatim to `connect_socketcan`, which failed silently. The prefix is now stripped alongside `socketcan://`.

#### Performance Fix
- **`list_recordings` read full files for metadata** (`lib.rs`): Every call to `list_recordings` read and fully deserialised every recording JSON file just to count frames and get the last timestamp — causing multi-second hangs with large recording libraries. `save_recording` now writes a lightweight `.meta.json` sidecar (`{frameCount, durationMs}`); `list_recordings` reads the sidecar when available, falling back to full-file scan only for legacy recordings. `delete_recording` also removes the sidecar.

---

## [v1.6.0] — 2026-05-28 (patch)
### 🌐 Translations Page

#### New Features
- **Translations page** (`/translations`): A dedicated full-page translations manager accessible from the sidebar (`🏷 Çeviriler / Translations`) and the Tag button in the CAN stat bar. Replaces the previous `LabelsEditorModal` which only covered 8 device-type labels.
  - **Namespace selector**: All 50+ namespaces (`can`, `common`, `dashboard`, `nav`, `canProfiles`, etc.) listed in a dropdown with key counts so you can jump directly to the section you need.
  - **Search bar**: Filters rows by key name, default EN value, default TR value, or any custom override — clears with the ✕ button.
  - **Editable table**: Five columns — Key · Default EN · Default TR · Custom EN · Custom TR. The custom columns are always-editable inputs; changes save automatically on blur. Placeholder text shows the built-in default so you always know what you're replacing.
  - **Override highlighting**: Rows with any active custom label get a subtle cyan left-border tint and cyan underline on the edited field so overrides are instantly visible.
  - **Per-row reset**: ↺ button on each overridden row to clear both EN and TR overrides for that key.
  - **Namespace reset**: "Reset all" button (visible only when overrides exist for the selected namespace) clears every override in that namespace at once.
  - **Export / Import**: Export all custom overrides as `uart_custom_labels.json`; import a previously exported file to restore or share label sets across devices.
- **`translations.*` i18n namespace**: All page UI strings (`title`, `subtitle`, `colKey`, `colCustomEn`, etc.) are fully translated into EN and TR.
- **`nav.translations`** key added (`"Translations"` / `"Çeviriler"`) for the sidebar and stat bar tooltip.

#### Removed
- `LabelsEditorModal` is superseded by the Translations page and is no longer opened from the CAN stat bar.

#### UX Polish
- **Translations moved to Settings group**: The `🏷 Translations` sidebar item was moved out of the UART section into a new **Settings** group (violet) at the bottom of the nav, since it is not UART-specific. Added `nav.settingsGroup` key (`"Settings"` / `"Ayarlar"`).
- **Sidebar group headers smaller**: Group header labels (`UART`, `CAN`, `SETTINGS`) reduced from `text-[9px]` to `text-[7px]` for a less dominant appearance.
- **Translations page header compact**: The page header was tightened to a single slim bar (`py-2`, `text-[11px]` title inline with `text-[9px]` subtitle) instead of a tall two-line block.

---

## [v1.6.0] — 2026-05-28 (patch)
### 🏷️ i18n — Translation Display Fix & Device Label Editor

#### Bug Fixes
- **Raw i18n keys in edit forms**: Node names stored as translation keys (e.g. `can.oRMonitor`, `can.eCGMonitor`) were shown verbatim in the edit form's name field. `EditNodeModal` and `CANProfiles` node form now call `resolveNodeName()` on open, so users see the resolved translation ("OR Monitor" / "Ameliyathane Monitörü") instead of the raw key. Saving converts the key to plain text permanently for that node.
- **Profile name dropdown showing keys**: The profile selector in the CAN stat bar now resolves i18n keys via `t()` before rendering, so preset profile names display correctly in both EN and TR.

#### New Features
- **Device Label Editor**: A new `Tag` icon button in the CAN stat bar opens the **Device Label Editor** modal. Users can override the display name for all 8 device type labels (Vital Monitor, IV Pump, Ventilator, ECG Monitor, Defibrillator, Infusion Pump, Pulse Oximeter, Custom Node) independently per language (EN and TR). Overrides are saved to `localStorage` (`uart_custom_labels`) and applied immediately across the entire UI. Leaving a field empty falls back to the built-in default. Each row has a reset (↺) button to clear its override.
- **Custom labels system**: `LanguageProvider` now checks a user override store before resolving built-in translations. `setCustomLabel(key, locale, value)` and `resetCustomLabel(key, locale?)` are exposed via `useTranslation()` for use in any component.

#### i18n
- Added keys `labelsEditor`, `labelsEditorHint`, `labelsEditorFooter`, `saveLabels`, `resetToDefault` to `can.*` namespace in `en.json` and `tr.json`.

---

## [v1.6.0] — 2026-05-27 (patch)
### ⚙️ Rust Backend — High-Resolution Timing & i18n Fix

#### Rust Backend Improvements
- **High-resolution timestamps**: All events (`serial-data`, `tcp-data`, `tcp-server-data`, `socketcan-frame`) now include a `"timestamp"` field populated on the Rust side via `SystemTime::now()` (nanosecond precision via `CLOCK_REALTIME`), eliminating IPC-induced timestamp drift.
- **SocketCAN `SO_TIMESTAMP`**: The CAN read socket now enables the `SO_TIMESTAMP` socket option. Frames are read via `recvmsg` instead of `read`, extracting the kernel-level hardware timestamp (µs precision) from the ancillary control message. Falls back to userspace `now_ms()` if the cmsg is absent.
- **SocketCAN event-driven loop**: Removed `O_NONBLOCK` + busy-wait `sleep(10 ms)` on `WouldBlock`. Replaced with `poll()` (100 ms timeout), eliminating CPU spin and reducing frame latency to sub-millisecond.
- **TCP Server — deadlock-safe read/write split**: The reader thread now owns its own `TcpStream` (thread-local); `active_stream_arc` holds only the write clone for `write_tcp_server`. This removes the architectural deadlock risk that forced the previous nonblocking + `sleep(20 ms)` polling design. Reads now block up to 100 ms via `set_read_timeout`.
- **Serial port**: Removed the redundant `sleep(10 ms)` + second `port.read()` batching call. The port's existing 100 ms `timeout()` already accumulates bytes; the extra sleep only added latency.
- **All source comments translated to English**.

#### Bug Fixes
- **i18n compliance**: `CANAutomationTab` had three hardcoded strings (`Wait`, `Duration:`, `ms`) not routed through the translation system. Fixed via new keys `can.autoWait`, `can.autoDuration`, and existing `common.unitMs`.

#### i18n
- Added `can.autoWait` (`Wait` / `Bekle`) and `can.autoDuration` (`Duration:` / `Süre:`) to `en.json` and `tr.json`.

---

## [v1.6.0] — 2026-05-24 (patch)
### 🤖 CAN Automation Tab — Bug Fixes & Enhancements

#### Bug Fixes
- **`nodeId = 0` stale reference**: Steps created before any CAN node was added stored `nodeId: 0`, causing fault/recover steps to silently fail at runtime (`Node not found`). A `useEffect` now auto-patches stale `nodeId` values to `nodes[0].id` whenever the node list changes.
- **`framesMatch()` bounds check**: When the expected data pattern was longer than the received frame's data array, `frame.data[i]` returned `undefined`, producing false negatives on every match. Added an early-exit guard (`dataPattern.length > frame.data.length → false`).
- **`expectTimeoutMs` negative value**: The `min={500}` HTML attribute was not enforced in the `onChange` handler — users could type negative or zero values. Now clamped with `Math.max(500, ...)`.
- **Empty profile stuck in timeline mode**: A timeline profile with zero steps would never complete because the completion check required `profile.steps.length > 0`. Removed the guard; an empty profile now finishes on the first ticker interval (~100 ms).
- **Group deletion leftover expand state**: Deleting a group no longer leaves its child group IDs in `expandedGroups`, preventing phantom expand/collapse states.

#### New Features
- **Export / Import scenarios**: Added **Export** (↓) and **Import** (↑) buttons to the scenario sidebar header. Export serialises all profiles and groups to a timestamped `.json` file; Import merges them back in, replacing the current state.
- **Expanded group state persistence**: The sidebar's group expand/collapse state is now saved to `localStorage` (`can-automation-expanded-v1`) and restored on page reload.
- **Hex input validation**: Send Frame and Expect Frame data fields now show a red border and an inline `"Geçersiz hex"` / `"Invalid hex"` warning when the input contains non-hex characters.
- **Arbitration ID range validation**: ID inputs reject values outside the 29-bit CAN range (`> 0x1FFFFFFF`). For standard (non-extended) frames, values above `0x7FF` show an amber `"ID > 0x7FF — use extended"` hint.
- **Timeline mode label clarification**: The step timing label in timeline mode now reads `ms @start` / `ms @başlangıç` instead of the ambiguous `ms`, making it clear the value is an absolute offset from scenario start.

#### i18n
- Added keys `autoExportScenarios`, `autoImportScenarios`, `autoTimelineAt`, `autoHexInvalid`, `autoArbIdRange` to `en.json` and `tr.json`.

---

## [v1.6.0] — 2026-05-24 (patch 2)
### 🌐 i18n — Unit Labels & Compliance Script Cleanup

#### Hardcoded Unit Labels → i18n
Previously `ID:`, `Data:`, `ms`, `bpm`, `mmHg`, `°C`, `/min`, `mL/h`, `mL`, `cmH2O` appeared as hardcoded strings in components. All are now routed through the translation system under the `common.*` namespace so future languages can override them.

| Key | EN | TR |
|---|---|---|
| `common.unitMs` | `ms` | `ms` |
| `common.unitBpm` | `bpm` | `bpm` |
| `common.unitMmhg` | `mmHg` | `mmHg` |
| `common.unitDegC` | `°C` | `°C` |
| `common.unitPerMin` | `/min` | `/dak` |
| `common.unitMlPerH` | `mL/h` | `mL/sa` |
| `common.unitMl` | `mL` | `mL` |
| `common.unitCmh2o` | `cmH2O` | `cmH2O` |
| `common.labelId` | `ID:` | `ID:` |
| `common.labelData` | `Data:` | `Veri:` |

**Files updated:** `CANAutomationTab.tsx`, `VitalsPanel.tsx`, `NodeCard.tsx`, `Visualizer3D.tsx`, `FrameInspector.tsx`, `Diagnostics.tsx`, `ScenarioEditor/index.tsx`

#### I18n Compliance Script — IGNORE_VALUES Refactor
- Removed **duplicate entries** (`borderRadius`, `fontSize`, `fontWeight`, `lineHeight`, `padding`, `margin`, `transparent`, `none`, `top`, `bottom` etc. — each appeared twice).
- Removed **phantom Turkish abbreviations** (`sa`, `dk`, `sn`) that were never present in the source code.
- Removed **phantom unit entries** (`Hz`, `MHz`, `kHz`, `sec`, `min`, `L/min`) that were suppressed defensively but do not appear as JSX text in the codebase.
- Removed units now covered by i18n (`ms`, `mmHg`, `cmH2O`, `mL`, `mL/h`, `bpm`, `ID:`, `Data:`).
- Re-organised remaining entries into labelled comment sections (MUI variants, CSS values, medical identifiers, hardware/protocol identifiers, Redux action types, keyboard keys, code false-positives).
- **I18n Compliance test still passes at BASELINE = 0.**

---

## [v1.6.0] — 2026-05-20
### 🚌 CAN Bus Simulator & UX Enhancements

### 🧪 Test Infrastructure

#### Bug Fix — Vitest 4 setupFiles Context Error (Issue #43)
- **Root cause**: `src/setupTests.ts` explicitly imported `expect`, `afterEach`, and `vi` from `vitest`. In Vitest 4 with `globals: true`, re-importing these symbols in a `setupFiles` module creates a context conflict and throws *"Vitest failed to find the current suite"* — causing all 34 test files to fail with 0 tests run.
- **Fix**: Removed the explicit `vitest` imports and the redundant `afterEach(() => cleanup())` call (React Testing Library v16 auto-cleans after each test). Added `"vitest/globals"` to `tsconfig.json` `types` so TypeScript resolves the injected globals.
- **Tests**: All 537 tests pass across 34 test files.

#### DBC File Parser — Full Signal Support
- **Signal definitions (`SG_`)**: Parser now fully extracts all signal fields — start bit, length, byte order (Intel/Motorola), sign, factor, offset, min, max, unit, and receivers. Previously only message metadata (`BO_`) was parsed; signals were silently discarded.
- **Multiplexing**: Multiplexer signals (`M`) and multiplexed signals (`m<value>`) are parsed and stored with `muxIndicator` / `muxValue` fields.
- **Value tables (`VAL_`)**: Enum/value-map tables are parsed and returned as `DBCValueTable[]` in the parse result.
- **`extractSignalValue()`**: New utility function decodes a signal's physical value from a raw CAN data byte array, handling both Intel (little-endian) and Motorola (big-endian) bit ordering, sign extension, and factor/offset scaling.

#### J1939 Frame Decoder
- **`parseJ1939Id()`**: New function in `CANFrameParser.ts` that decodes all SAE J1939 fields from a 29-bit extended CAN arbitration ID — priority, Data Page, PGN, PF, PS, source address, destination address, and PDU type (peer-to-peer vs broadcast).
- **`j1939PgnName()`**: Lookup table for common J1939 Parameter Group Numbers (DM1, Engine Temperature, Vehicle Speed, Fuel Economy, EEC1, etc.).
- **`J1939Info` type**: Added to `CANFrame.ts`; optional `j1939?` field added to the `CANFrame` interface.
- **Frame Inspector integration**: When a 29-bit extended frame is selected in the CAN Dashboard, the Frame Inspector automatically shows a J1939 panel with decoded PGN name, priority, PF/PS bytes, source and destination addresses, and PDU type.

#### Light Mode — Soft Blue-Gray Theme
- Replaced the harsh pure-white light mode palette with a professional cool blue-gray scale (`#eef3f8` base).
- Updated `html.light` CSS variable overrides in `index.css`: backgrounds now range from `#eef3f8` (page) → `#e4ecf3` (content panels) → `#d4e0ea` (cards), with matching text and accent color adjustments for readability on light backgrounds.
- Scrollbar colors now use CSS variables and adapt correctly in both themes.

#### i18n — DiagnosticTerminal & J1939 Full Compliance
- **DiagnosticTerminal.tsx**: Replaced 28 hardcoded English strings with `t()` calls. Added `useTranslation` import. Strings covered: title, transport description, Symphony toggle, Request/Response ID labels, preset buttons, session type options, Data Identifier, DTC Status Mask, UDS Payload, Send Request button, Symphony DID Responses section, Add DID, Target Node, Auto from request ID, encoding options (ASCII / Hex / Vitals), enabled label, log column headers (Time / ID / PCI / Data), empty-state message, and both validation error messages.
- **FrameInspector.tsx**: Replaced 9 hardcoded J1939 field labels with `t()` calls: J1939 panel label, Priority, PF (PDU Format), PS (PDU Specific), Source Address, Destination, PDU Type, PDU1/PDU2 values, and Data Page.
- **`uds.*` namespace**: Added 43 new keys to `en.json` and `tr.json` covering all DiagnosticTerminal and J1939 UI strings.
- **I18n compliance test**: `I18nCompliance` suite now passes with **0 findings** (BASELINE = 0).

#### Bug Fix — CANErrorInjection Test (Issue #37)
- **Root cause**: `sendCustomFrame` unconditionally called `handleIsoTpFrame`, so any frame whose first byte had a top nibble of `0x0` was interpreted as an ISO-TP Single Frame and triggered a UDS auto-response — emitting a second frame and breaking the test assertion `toHaveLength(1)`.
- **Fix**: Added `isDiagnosticAddress()` guard; `handleIsoTpFrame` is now only invoked when the arbitration ID is in the UDS functional address range (`0x7DF`, `0x7E0–0x7E7`, or the configured tester request ID). Non-diagnostic CAN IDs (e.g. `0x321`) no longer trigger ISO-TP processing.
- **Tests**: All 537 tests pass across 34 test files.

#### Housekeeping
- `findings.json` (i18n audit snapshot) added to `.gitignore`.

#### Documentation
- Added **Section 20 (CAN Bus Simulator)** to the Table of Contents in both `GUIDE_TR.md` and `GUIDE_EN.md`.
- Added **§20.12 DBC File Import & Signal Decoder** — covers supported DBC elements, byte order modes, and signal viewing in Frame Inspector.
- Added **§20.13 J1939 Frame Decoder** — covers 29-bit ID layout, PDU types, common PGNs, and Frame Inspector integration.

#### UDS (ISO 14229) Diagnostic Layer over CAN
- **ISO-TP transport (ISO 15765-2)**: Full segmentation and reassembly of multi-frame messages. Supports Single Frame (SF), First Frame (FF), Consecutive Frame (CF), and Flow Control (FC) PCI types. Configurable `blockSize` and `STmin` (separation time).
- **UDS service support**:
  - `0x10` Diagnostic Session Control — responds with session parameters (P2/P2* timing).
  - `0x22` Read Data By Identifier — supports multiple DIDs per request, three response encodings: ASCII, Hex bytes, and live Vitals (reads from the simulation engine in real time).
  - `0x19` Read DTC Information (sub-function `0x02`) — returns configured mock DTC codes with a status mask byte.
  - Unknown SIDs — returns `0x7F` NRC `0x11` (serviceNotSupported).
- **Symphony auto-responder**: The ECU side of the diagnostic session can be toggled on/off. When enabled, the engine automatically generates and transmits ISO-TP responses; when disabled, requests are still transmitted but go unanswered (useful for passive logging).
- **Diagnostic Terminal UI**: New dedicated tab on the CAN Dashboard with:
  - Request builder presets: Session Control (`0x10`), Read DID (`0x22`), Read DTC (`0x19`), Raw payload.
  - Configurable tester/ECU CAN IDs (auto-derives ECU response ID from standard `0x7E0`–`0x7E7` range).
  - Symphony DID response table — add, edit, enable/disable, or remove DID entries at runtime.
  - Target Node selector — bind vitals responses to a specific simulated node or let the engine choose automatically from the request ID.
  - ISO-TP frame log panel — displays all diagnostic traffic with colour-coded PCI type labels (SF/FF/CF/FC).
- **Worker integration**: Added `CAN_SEND_UDS_REQUEST` and `CAN_SET_UDS_CONFIG` message types to the CAN Web Worker.
- **State management**: `udsConfig` field added to `CANBusState`; `SET_UDS_CONFIG` action added to `canReducer`; `sendUDSRequest` and `setUDSConfig` exposed through `CANContext`.
- **Tests**: Three focused tests added for the UDS layer — multi-frame `0x22` segmentation and flow control sequence, multi-frame request reassembly via `sendCustomFrame`, and `0x19` DTC response content validation.

#### CAN Auto Baud Detection & Protocol Sniffer
- **Smart Listen overlay**: Added a passive discovery overlay to the CAN Dashboard. It scans observed bus traffic without transmitting frames or changing existing traffic.
- **CAN protocol identification**: Detects Standard 11-bit and Extended 29-bit CAN traffic from captured frames and arbitration identifiers.
- **Baud rate locking**: Estimates and locks to common CAN bit rates (`125k`, `250k`, `500k`, `1M`) with a 5% margin requirement before enabling synchronization.
- **Sync and Connect flow**: Shows a **Sync and Connect** button once the detector has sufficient confidence, then applies the detected CAN baud rate and returns the user to the Bus Monitor.
- **Shared detector tests**: Added focused test coverage for baud estimation, CAN Standard/Extended detection, Modbus RTU signature detection, and lock criteria.
- **i18n**: Added `smartListen.*` translations in English and Turkish.

#### CAN Bus Module (New)
- **CAN Dashboard**: Fully featured dashboard for real-time CAN bus simulation. Powered by an independent Web Worker-based simulation engine (`can.worker.ts`), utilizing a `CANProvider` context completely decoupled from the UART module.
- **Bus Monitor**: Live frame stream, including arbitration and error frames. Supports filtering and stop/start/pause controls.
- **Frame Inspector**: Bit-level detailed view of the selected CAN frame — arbitration ID, DLC, data bytes, CRC, and EOF.
- **Nodes Tab**: Add, edit, and delete nodes; assign medical profiles (ECG, SpO₂, NIBP, etc.), custom colors, baud rates, and transmission intervals to each node.
- **Arbitration Tab**: Collisions logging and analysis of winning/losing nodes.
- **Fault Injection Panel**: Inject faults (bit flips, CRC errors, bus-off) into selected nodes; includes support for node recovery.
- **Compliance Panel**: IEC 60601-1 / ISO 11898-1 / CiA 301 compliance checks.
- **Automation Tab**: Step-based automation support for CAN scenarios.
- **Vitals Panel**: Real-time display of vital values (BPM, SpO₂, NIBP, temperature) received from nodes with medical profiles.
- **CANStatBar**: Top information bar — displays total frames, error count, bus load, baud rate selector, and profile loader.

#### CAN Profiles
- **CANProfiles Page**: Save and load CAN node configurations as profiles. Integrated into the sidebar as a distinct `/can-profiles` route.
- **Profile Storage**: `localStorage`-based `canProfileStorage` — handles profile saving, loading, and deletion.

#### Sidebar & Navigation
- Added the CAN section to the sidebar with an orange color theme, containing links to `🚌 Dashboard` and `🗂 Profiles`.
- Bound the sidebar group title `"CAN"` to the i18n key (`nav.canGroup`).
- Removed redundant "CAN" prefixes from CAN submenus.

#### Bug Fixes
- Fixed an issue where clicking the "+" (add profile) button on the CAN Dashboard caused a black screen without any way to return. Corrected `navigate('/can/profiles')` (non-existent route) to `navigate('/can-profiles')`.
- Removed the unread message badge from the Log tab — under high-frequency data streams, the badge counter incremented endlessly, rendering it meaningless.

#### i18n
- Fully populated the `can.*` namespace (~60 keys): `busMonitor`, `nodes`, `arbitration`, `log`, `faultInjection`, `compliance`, `automation`, `vitals`, `filter`, `resume`, `clear`, etc.
- Added the `canProfiles.*` namespace (14 keys): `savedProfiles`, `loadToBus`, `hint`, `deleteConfirm`, etc.
- Added `nav.canGroup`.
- Fixed corrupted unicode sequences (mojibake): `✔ Recovered`, `IEC 60601-1 · ISO 11898-1 · CiA 301`, `cmH₂O`, `FiO₂`, etc.
- Completed all values for both TR and EN; all 13/13 i18n tests are passing.

---

## [v1.5.28] — 2026-05-18

### UX & Developer Tools (Unreleased — part of v1.5.28)

#### Profile Editor
- **Profile Compare Modal**: Added a "⇆" button to the Profile Editor toolbar. When 2+ profiles exist, clicking it opens a full-screen comparison modal, reusing the existing `ProfileCompare` component.
- **Frame Timing / BER Panel**: Added a toggleable ribbon panel opened via the "BER" button on the toolbar. Based on the active baud rate, parity, stop bits, and frame size, it calculates: bits/byte, bits/frame, frame duration (µs), maximum FPS, requested FPS, and line utilization percentage. Shows a red warning if requested FPS exceeds the maximum.
- **Profile Tags**: Added a `tags?: string[]` field to each profile. Added tag input in the UART settings row; tags can be added via Enter or "+" and deleted via "×". Active tags appear as filter buttons in the left panel — clicking a tag filters the list to show only profiles with that tag.
- **Last Used Field Type**: In `FieldEditor`, when a field type is changed, the selection is saved in `localStorage`. The last used type is remembered in the next session.

#### Frame Monitor
- **Frame Recorder (CSV)**: Added "⏺" start recording / "⏹" stop recording buttons to the TX history header. Captured frames are exported to a CSV file named `uart_frames_<timestamp>.csv` (columns: frame, timestamp_ms, bytes, hex, errors).
- **Frame Flash Animation**: Each incoming frame briefly highlights its corresponding row with a greenish flash animation for 400 ms.

#### Dashboard
- **Keyboard Shortcuts Modal**: Added a shortcuts cheatsheet modal toggleable via the `?` key (when not focusing an input), covering simulation, editor, frame monitor, and analysis groups. Can be closed by clicking outside or pressing Esc.

#### Community Template Library
- **Favorites**: Added a ☆/★ button to each template card. Favorite IDs are stored in `localStorage`. Templates are automatically sorted based on favorites; the "★ Favorites" filter button displays only starred templates.

#### i18n
- `frameMonitor`: 2 new keys (`recordStart`, `recordStop`)
- `templateBrowser.community`: 4 new keys (`favorites`, `showFavorites`, `favorite`, `unfavorite`)
- `profileEditor`: 10 new keys (`tags`, `addTag`, `compareProfiles`, `berTitle`, `berBitsPerByte`, `berBitsPerFrame`, `berFrameTime`, `berMaxFps`, `berRequestedFps`, `berUtil`)
- `shortcuts`: 25 new keys for all shortcut groups (new namespace)

---

## [v1.5.28] — 2026-05-17
### 🚀 Release v1.5.28

#### Topluluk Şablon Kütüphanesi
- **Community Templates**: Kullanıcılar kendi profil şablonlarını `.json` olarak toplulukla paylaşabilir. Uygulama içinden tek tıkla import edilebilir.
- **GitHub Pages Template Index**: `docs/community-templates/index.json` üzerinden serve edilen onaylı şablon listesi.
- **GitHub Showcase Page**: `docs/index.html` — projenin tanıtım sayfası GitHub Pages üzerinden yayında.

---

## [v1.5.27] — 2026-05-16
### 🚀 Release v1.5.27

#### Otomasyon & Test Paketi
- **Automation Tab Rename**: "Testler" tab renamed to "Otomasyon" (TR) / "Automation" (EN) to clearly distinguish it from the "Test Paketi" tab.
- **Test Series Mode**: New multi-sequence execution mode in the Sequence Runner. Select multiple sequences across groups, run them back-to-back, and get a professional PDF report with per-step pass/fail results.
- **Sequence Combobox**: Replaced the plain dropdown with a searchable combobox supporting group headers, keyboard navigation (↑↓ Enter Esc), and filtered results.
- **Group-Level Selection**: Campaign mode supports three checkbox states — all selected (filled), partial (minus), none — with a single click to toggle the whole group.
- **PDF Report**: Locale-aware PDF report generated via a hidden iframe (Tauri-compatible). Includes summary cards, pass-rate progress bar, grouped sequence tables with colour-coded step pills, and a bilingual footer.
- **Full i18n Coverage**: 45 new keys added to `automation.*` namespace in both `tr.json` and `en.json`. All hardcoded strings in `SequenceRunner`, `ReportModal`, and `SequenceCombobox` replaced with `t()` calls including interpolated keys (`selectedCount`, `summaryFooter`, `groupPassOf`). PDF brand text and date locale also follow the active language.
- **Save Overwrite Fix**: `isNewModeRef` flag prevents the `useEffect` loader from overwriting a new unsaved sequence when sequences already exist in state.
- **Test Coverage**: 31 new tests in `SequenceRunner.test.tsx` covering TR/EN labels for all UI sections, combobox placeholders, campaign mode empty state, and a key-coverage loop that asserts all 37 new automation keys are present in both locales.
- **Compliance Fix**: `en-GB` and `Segoe UI` added to the i18n compliance test whitelist (locale string and PDF font — not user-visible strings).
- **Documentation**: Section 13 of `GUIDE_TR.md` and `GUIDE_EN.md` rewritten to document the Sequence Runner (step types, Single Sequence workflow, Test Series workflow, PDF report). `README.md` updated with the new feature.
- **Sequence Import / Export (JSON)**: Sequences can now be exported to and imported from `.json` files. Export the current sequence (Single Sequence mode toolbar icon) or all sequences at once (Test Series toolbar link). Import merges sequences with fresh UUIDs — existing data is never overwritten. File format: `{ format: "uart-sequences", version, exportedAt, sequences }`.
- **JUnit XML Export**: The Test Series report modal now includes a **JUnit XML** download button. Generates a `<testsuites>/<testsuite>/<testcase>` structure compatible with Jenkins, GitLab CI, and GitHub Actions. Failed sequences include a `<failure>` element with the error message.
- **Loop / Repeat Step Support**: Each automation step now has a **×N repeat counter** (default: 1, max: 99). The step executes N times in sequence before moving to the next step — useful for burst-sending or stress-testing a single command.
- **Download via Tauri FS**: File downloads (JSON export, JUnit XML) now use `@tauri-apps/plugin-fs` `writeTextFile` with `BaseDirectory.Download`, bypassing the Tauri WebView2 limitation that blocks `a.download` + blob URL on Windows. Falls back to the blob anchor method in non-Tauri environments.
- **Export Guard**: An `exporting` state flag prevents duplicate file creation when a button is clicked multiple times. Export buttons are disabled with `cursor-wait` while a download is in progress.
- **i18n (automation)**: 6 new keys added to the `automation.*` namespace in both `tr.json` and `en.json`: `exportJson`, `importJson`, `importSuccess`, `importError`, `downloadJunit`, `repeatLabel`.
- **Test Coverage (SequenceRunner)**: 12 new tests (43 total): import/export button title assertions, repeat input presence and default-value checks, `×` label rendering, and coverage of all 6 new i18n keys.
- **Documentation**: Sections 13.1.4 (Import/Export JSON) and 13.1.5 (JUnit XML Export) added to `GUIDE_TR.md` and `GUIDE_EN.md`. Step types table and Single Sequence workflow updated to document the repeat (×N) feature.

#### Profile Editor & Template Library
- **YS2000A Patient Monitor Template**: New 14-byte clinical frame added to the Template Library — Sync (0xAAAA, 2B), BPM (1B), SpO₂ (1B), RR (1B), Temp (2B, ×10), Lead-I (2B ECG), Lead-II (2B ECG), SpO₂-Wave (1B), Alarms flags (1B), XOR CRC (1B). Baud 115200, 40 ms interval (~25 Hz). Ships with two ready-to-run scenarios: **Bradycardia Attack** (BPM ramp to 38 → alarm bit → recovery) and **SpO₂ Desaturation** (SpO₂ ramp to 88 → SpO₂ Low flag → recovery).
- **Per-Field Alarm Thresholds in Profile Editor**: Every `range`, `waveform`, `ramp`, and `fixed` field can now have an optional **Low Threshold** (`alarmLow`) and **High Threshold** (`alarmHigh`). A value outside that range is considered an alarm condition. The thresholds are stored on the `Field` type (`src/types/field.ts`) and are preserved correctly through localStorage round-trips.
- **Storage Bug Fix — alarmLow/alarmHigh lost on reload**: `normalizeField` in `storage.ts` was silently dropping `alarmLow` and `alarmHigh` when loading profiles from localStorage. Fixed by spreading them conditionally with `Number.isFinite` guard.
- **ProfileEditorModal Removed**: The inline modal-based profile editor on the Simulation Dashboard has been removed. "Add Profile" and "Edit Profile" now navigate to the full `/profiles` page via URL params (`?new=1&from=dashboard` / `?edit=<id>&from=dashboard`). The ProfileEditor auto-opens the correct dialog on mount and returns to `/` after saving. A "← Dashboard" back button is shown when navigating from the dashboard.
- **i18n (profileEditor)**: 7 new keys added to `en.json` and `tr.json`: `alarmThresholds`, `alarmLow`, `alarmHigh`, `alarmThresholdsHint`, `visualizer.alarmBrady`, `visualizer.alarmTachy`, `visualizer.alarmHypox`.

#### Control Panel
- **Colored Alarm Zones on Field Override Sliders**: The Override sliders in the Control Panel now render a layered custom track (red – green – red) based on each field's `alarmLow` / `alarmHigh` thresholds. Zone padding (25% of span, min 3) ensures red zones are always visible even when thresholds are at the slider extremes. Alarm zones are dim (opacity 22%) when the value is normal and bright (opacity 85%) when the value enters the alarm zone. A pulsing `!` badge and rose label appear on the alarming field. When any field is in alarm, all other range-field labels turn dim rose to signal global alarm state.

#### 3D Visualizer
- **Profile Dropdown in Visualizer Tab**: A profile selector `<select>` is now embedded in the 3D Visualizer's top-right HUD, allowing the active profile to be changed without leaving the Visualizer tab.
- **3D Visualizer Performance Improvements**: Shadow map 2048×2048 → 1024×1024 (4× less GPU cost); pixel ratio locked to 1 (no HiDPI overhead); `THREE.RectAreaLight` replaced with `THREE.PointLight`; `logarithmicDepthBuffer` disabled; per-device mesh `traverse` now only runs when active/selection state actually changes.
- **3D Visualizer Deprecation Fixes**: `THREE.Clock` → `THREE.Timer`; `THREE.PCFSoftShadowMap` → `THREE.PCFShadowMap`.
- **Profile-Driven Alarm Thresholds in Visualizer**: The 3D patient monitor and pulse-oximeter screens now read `alarmLow`/`alarmHigh` from the active profile instead of hardcoded clinical defaults.
- **Turkish Field Name Normalization**: Field-to-device binding lookup now normalises Turkish characters (ı→i, ş→s, ğ→g, ç→c, ö→o, ü→u) so Turkish-named fields map correctly to 3D device screens.
- **Alarm Vignette & Improved HUD**: Pulsing red border vignette on alarm; top-center banner shows named alarm type (Bradycardia / Tachycardia / Hypoxemia) at 750 ms flash; BPM and SpO₂ are coloured independently based on their own alarm state.

---

## [v1.5.26] — 2026-05-14
### 🚀 Release v1.5.26
- **Help System Overhaul**: The `/help` page was rewritten from scratch — interactive TOC sidebar with `IntersectionObserver`-based active section tracking, full Markdown support via `rehype-raw` and `remark-gfm` plugins.
- **Comprehensive Guide Files**: `GUIDE_EN.md` and `GUIDE_TR.md` completely rewritten with 19 sections, tables, code examples, and all application screenshots (~500+ lines each).
- **Image Path Fix**: Image paths in the help page and HelpModal corrected (added `/docs/` prefix) so images load correctly in all contexts.
- **HelpModal File References**: Modal now correctly loads `GUIDE_TR.md` and `GUIDE_EN.md` instead of non-existent files.
- **Dynamic Version Number**: Hardcoded `1.4.0` in `CommandPalette` replaced with `__APP_VERSION__`, automatically read from `package.json`.
- **ErrorBoundary Integration**: All 6 routes (`/`, `/builder`, `/lab`, `/help`, `/scenarios`, `/profiles`) wrapped with `ErrorBoundary`; component-level crashes now reported via `ErrorReportPanel`.
- **Type Safety Improvements**: `as any` casts in `CsvExporter.ts` replaced with `FlagsConfig`; duplicate `SET_SEQUENCES` union member removed from `simulationReducer.ts`.
- **Console Log Cleanup**: 11 `console.log` calls in `SimulationEngine.ts` gated behind `import.meta.env.DEV` — no log output in production builds.
- **Memory Management**: Max-size limits added for `fullLogRef` (2000), `exchangeBufferRef` (500), and `conversationBufferRef` (500); waveform history trimmed with `slice` instead of `splice`.
- **Dead Code Removal**: Unused `CustomTooltip` interface and component removed from `SimulationDashboard/index.tsx`.
- **Test Coverage Improvements**: Comprehensive unit tests added for 3 components:
  - `ControlPanel.tsx` — Branches: **86.11% → 97.22%** (tx/rx/error/info log color classes, CSV export button)
  - `StatBar.tsx` — Statements: **42.85% → 95.91%**, Lines: **40.9% → 97.72%** (Start/Stop/Pause/Resume, validation sessions, recording, TCP inputs, port selection, export)
  - 13 failing tests fixed: locale setup (`uart_locale=en`) and removal of the destructive `document.body.appendChild` mock
- **Localization**: `helpPage.tableOfContents` key added to TR/EN locale files.
- **Waveform Sliding Window Fix**: `CanvasWaveform` was compressing the entire simulation history into a fixed-width canvas — the longer the simulation ran, the more data was squeezed in, making waveform frequency appear to increase over time. Fixed by switching to a sliding window that always renders only the last N points (proportional to canvas width), so waveforms scroll at a constant visual speed regardless of session length.

---

## [v1.5.25] — 2026-05-13
### 🚀 Release v1.5.25
- **I18n Compliance Test Suite**: Automated test added that scans all source files and validates `t('...')` translation keys. Missing translations are now caught immediately during development and CI.
- **44 Missing Translation Keys Completed**: For Logic Analyzer and Trigger Manager components:
  - `logic.*` block (19 keys): Waiting for signal, START, STOP, PARITY, ΔT, Freq, Logic Analyzer, Zoom, Clear Cursors, Running, Paused, UART TX, scroll/zoom/measure instructions, No data, Reset Cursors, Live Sync, Static View, Baud
  - `triggerManager.*` block (14 keys): New Trigger, Unnamed Trigger, Trigger Manager, No Rules, Rule Name, Condition, Action, Save, Cancel, ACTIVE, Critical Monitor and action labels (Stop Simulation, Start Recording, Log Warning, Inject Error, Set Field Value)
  - Isolated keys: `common.injection`, `profileEditor.bit0`, `scenarioEditor.templates`
- **Localization Infrastructure**: I18n compliance tests (I18nCompliance, LocaleParity) now automatically detect all missing translations and language parity issues.

---

## [v1.5.24] — 2026-05-11
### 🚀 Release v1.5.24
- **Conversation & Data Exchange Monitoring**: ConversationMonitor and ExchangeMonitor components added for real-time communication logs and data flow visualization.
- **Playback Panel Improvements**: Recorded simulations can now be saved as scenarios and reused across different test runs.
- **Profile Compare (ProfileCompare)**: New tool to compare two frame profiles side-by-side — highlights field structures, byte widths, and differences.
- **Test Suite Enhancements**: New assertion types added including exchange acknowledgment and latency checks.
- **WaveformDesigner Enhancements**: Formula snippets and examples added to simplify waveform authoring.
- **Error Injection History**: Error injection history tracking added to simulation state for easier debugging.

---

## [v1.5.23] — 2026-05-09
### 🚀 Release v1.5.23
- **Auto-Updater**: Integrated `tauri-plugin-updater` — the app checks GitHub Releases for updates on startup, notifies the user via a bottom-right toast, and installs with a single click followed by an automatic restart.
- **LinkedIn Integration**: Developer profile officially added to the application UI and documentation.

---

## [v1.5.22] — 2026-05-09
### 🚀 Release v1.5.22
- New version released.

---

## [v1.5.21] — 2026-05-09
### 🚀 Release v1.5.21
- New version released.

---

## [v1.5.20] — 2026-05-09
### 🚀 Release v1.5.20
- New version released.

---

## [v1.5.19] — 2026-05-09
### 🚀 Release v1.5.19
- **Interactive Responder (Script Responder)**: The simulator is no longer just a TX data source — it can now respond to commands received over RX. The `dynamic-script` rule allows incoming bytes to be processed and reacted to with `sendString` or `pause/stop` commands.
- **Bidirectional Timeline Terminal (Quick Send)**: A Quick Send bar added to the Timeline screen allows HEX or ASCII commands (e.g. `hello`, `pause`) to be injected on-the-fly while the simulation is running.
- **UTF-8 and Loopback Optimization**: `TextEncoder` infrastructure added to ensure Turkish characters (`ı`, `ş`, etc.) are transmitted without corruption to external terminals like PuTTY. Automatic `CRLF` (line ending) support added for ASCII sends.
- **VCD Export Support**: An IEEE 1364 VCD export engine added so telemetry recordings can be inspected at the bit level in Logic Analyzer tools (e.g. PulseView).
- **CSV Data Science Export**: "Save as CSV" (FileSpreadsheet) feature added for developers and data scientists to open telemetry recordings in Excel and Python-based tools.
- **ASCII Text Transfer**: `isAscii` support added to the signal generator for text-based profiles like NMEA 0183 so data is human-readable in PuTTY and similar terminals.
- **Icon and Translation Fixes**: Unsupported next-gen emojis on Windows replaced with standard symbols (💓, ⚕️); missing language keys patched.
- **Tauri Routing Optimization**: In-app tab navigation stabilized by switching from `window.open` to React Router `navigate`.

---

## [v1.5.18] — 2026-05-09
### 🚀 Release v1.5.18
- New version released.

---

## [v1.5.17] — 2026-05-09
### 🚀 Release v1.5.17
- New version released.

---

## [v1.5.16] — 2026-05-09
### 🚀 Release v1.5.16
- New version released.

---

## [v1.5.15] — 2026-05-09
### 🚀 Release v1.5.15
- New version released.

---

## [v1.5.14] — 2026-05-09
### 🚀 Release v1.5.14
- New version released.

---

## [v1.5.13] — 2026-05-09
### 🚀 Release v1.5.13
- New version released.

---

## [v1.5.12] — 2026-05-09
### 🚀 Release v1.5.12
- New version released.

---

## [v1.5.11] — 2026-05-09
### 🚀 Release v1.5.11
- New version released.

---

## [v1.5.10] — 2026-05-09
### 🚀 Release v1.5.10
- New version released.

---

## [v1.5.9] — 2026-05-09
### 🚀 Release v1.5.9
- New version released.

---

## [v1.5.8] — 2026-05-08
### 🚀 Release v1.5.8
- New version released.

---

## [v1.5.7] — 2026-05-08
### 🚀 Release v1.5.7
- New version released.

---

## [v1.5.6] — 2026-05-08
### 🚀 Release v1.5.6
- New version released.

---

## [v1.5.5] — 2026-05-08
### 🚀 Release v1.5.5
- New version released.

---

## [v1.5.4] — 2026-05-08
### 🚀 Release v1.5.4
- New version released.

---

## [v1.5.0] — 2026-05-08
### 🔄 Auto-Updater, CI/CD Improvements & Release Automation

#### ✨ New Features
- **Auto-Updater**: `tauri-plugin-updater` integration — the app checks GitHub Releases for updates on startup, shows a notification in the bottom-right corner when a new version is available, and restarts after a one-click download.
- **Release Script** (`npm run release -- 1.5`): A single command updates version numbers in `package.json`, `Cargo.toml`, `tauri.conf.json`, `README.md`, and `CHANGELOG.md`, then commits, tags, and pushes.
- **Dynamic Version**: The version number in the sidebar is now read automatically from `package.json` — no more hardcoded values.

#### 🔧 CI/CD Improvements
- GitHub Actions upgraded to Node.js 24 (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`).
- Ubuntu runner updated `22.04` → `24.04`.
- `actions/checkout` and `actions/setup-node` upgraded to v5.
- Tauri signing secrets added to workflow (`TAURI_SIGNING_PRIVATE_KEY`).

#### 🛠 Bug Fixes
- **Vite 8 Worker Build Fix**: Added `esbuild ^0.28.0` dependency — Web Worker bundle was failing in CI.
- **Build Target**: `safari13` → `safari16` — removed destructuring transform unsupported by esbuild.
- **Rust Edition**: `Cargo.toml` edition updated to `2024`.
- Added `tauri-plugin-process` (required for app restart after update).

#### 📦 Dependency Updates
- All npm packages updated to latest versions (`esbuild`, `vite`, `vitest`, `eslint`, `react`, `uuid`, `zustand`, etc.).
- Node.js minimum requirement updated to `>=24.0.0`.

---

## [v1.4.0] — 2026-05-01
### 🚀 Custom Waveform Designer & High-Density UI Overhaul
- **Custom Waveform Designer (Lab)**:
  - Design signals via freehand drawing, mathematical expressions (Formula), or a medical library (ECG, PPG, Resp, Square, Noise).
  - Designed signals are injected into the live UART stream in real-time.
- **High-Density Dashboard**:
  - Professional "Bento-Grid" layout increasing information density by 60%.
  - 13px compact font hierarchy with optimized cell spacing.
- **I18n Compliance Suite**:
  - System-wide 100% TR/EN language support with automated compliance tests.
- **UI/UX Refinement**:
  - Builder tab migrated to a dynamic sub-tab structure (Frame / Waveform).
  - Professional medical design language with Emerald & Amber accents.

---

## [v1.3.5] — 2026-04-30
### ✨ Scriptable Virtual Peripheral Designer
- **Dynamic Hardware Modeling**: A module for designing and scripting custom virtual peripherals using an embedded JS engine.
- **Zustand State Management**: Peripheral management migrated to a high-performance `Zustand` architecture.
- **Real-time Script Runner**: Sandboxed JS engine that processes incoming bytes.
- **Integrated Debugger**: New design page with a code editor and live state visualizer.

---

## [v1.3.0] — 2026-04-23
### 📈 Signal Fidelity & Diagnostic Station
- **HUD Sparklines**: Real-time mini waveforms added inside vital cards.
- **Diagnostic Scope**: Oscilloscope panel monitoring raw UART signal integrity at microsecond precision.
- **Fuzzy-Matching Engine**: Smart data matching engine that tolerates mismatches in field names.
- **Smart Loopback Alignment**: Automatic time-tunnel alignment of TX and RX signals.

---

## [v1.2.0] — 2026-04-17
### 🏥 Medical Digital Twin Overhaul & Validation
- **Medical Digital Twin**: 3D monitor design with "Pearl White" finish and dynamic lighting.
- **Compliance Reporting**: Print-optimized PDF reporting support conforming to medical standards.
- **Certification Suite**: Real-time "Monitoring Engine" that validates BPM, SpO2, and Resp limits.
- **Physical Connectors**: Color-coded connectors (ECG, Resp, SpO2) overlaid on the 3D model.

---

## [v1.1.0] — 2026-04-10
### ⚙️ UART Core & Scenario Automation
- **Scenario Editor**: Event-driven automation system for complex data flows.
- **Error Injection**: Simulation support for Checksum, Framing, and Parity errors.
- **Level 4 Logic Analyzer**: Real-time bit-level signal analysis.

---

## [v1.0.0] and Earlier
- **UART Core Engine**: Foundations of data generation and frame assembly.
- **Protocol Support**: Standard UART protocol and basic telemetry visualization.

---

© 2026 Mustafa Sercan Sak — MedNet Suite Team
