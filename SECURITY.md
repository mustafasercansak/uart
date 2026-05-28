# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.6.x   | ✅ Active  |
| < 1.6   | ❌ No longer supported |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, **please do not open a public GitHub issue.**

Instead, report it privately via one of the following:

- **GitHub Private Vulnerability Reporting**: Use the [Security tab](../../security/advisories/new) on this repository.
- **Email**: mustafasercansak@gmail.com — include `[SECURITY]` in the subject line.

Please include:
- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact
- Any suggested fix if you have one

## What to Expect

- **Acknowledgement** within 48 hours of your report.
- **Status update** within 7 days (confirmed, in progress, or not applicable).
- **Fix and release** as soon as possible for confirmed vulnerabilities, with credit given to the reporter if desired.

## Scope

This is a **desktop simulation tool** that runs locally via Tauri. It does not operate any public-facing server or store user credentials. Areas of concern most relevant to this project:

- **SocketCAN / serial port access**: Tauri commands that interact with hardware interfaces (`connect_socketcan`, `write_socketcan_frame`, serial port commands).
- **File system access**: Recording and profile persistence via Tauri FS commands.
- **Unsafe Rust code**: Any `unsafe` blocks in `src-tauri/src/lib.rs` (raw fd operations, `libc` calls).
- **DBC / JSON parsing**: Malformed input files that could cause panics or unexpected behavior.

## Out of Scope

- Issues in third-party dependencies (please report those upstream).
- Simulation accuracy or medical correctness — this tool is for educational/testing purposes only and is **not a certified medical device**.
