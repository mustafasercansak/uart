# 📜 UART Sensor Simulator — Changelog

All notable milestones of the UART Sensor Simulator's evolution toward a "Medical Simulation & Certification Suite" are tracked in this file.

## [Unreleased] — CAN Smart Listen

### CAN Auto Baud Detection & Protocol Sniffer
- **Smart Listen overlay**: Added a passive discovery overlay to the CAN Dashboard. It scans observed bus traffic without transmitting frames or changing existing traffic.
- **CAN protocol identification**: Detects Standard 11-bit and Extended 29-bit CAN traffic from captured frames and arbitration identifiers.
- **Baud rate locking**: Estimates and locks to common CAN bit rates (`125k`, `250k`, `500k`, `1M`) with a 5% margin requirement before enabling synchronization.
- **Sync and Connect flow**: Shows a **Sync and Connect** button once the detector has sufficient confidence, then applies the detected CAN baud rate and returns the user to the Bus Monitor.
- **Shared detector tests**: Added focused test coverage for baud estimation, CAN Standard/Extended detection, Modbus RTU signature detection, and lock criteria.
- **i18n**: Added `smartListen.*` translations in English and Turkish.

---

## [v1.6.0] — 2026-05-19
### 🚌 CAN Bus Simulator & UX Enhancements

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

## [v1.5.28 — in progress] — 2026-05-18

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
