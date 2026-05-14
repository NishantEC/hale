# WHOOP Reverse-Engineering Community Survey

**Compiled:** May 2026
**Purpose:** Snapshot of every actively-known open-source project that talks to a WHOOP strap, what each one has decoded, the official feature surface we'd be competing with, and what's hard vs. easy to replicate. Source links are inline; each row of the feature matrix points back to the project's repo.

---

## 1. Executive summary

The WHOOP RE community is small but coherent. Two original "founder" efforts (jogolden/whoomp and bWanShiTong/reverse-engineering-whoop-post) established the protocol map for the 4.0 strap; almost every later project either forks their findings or wraps WHOOP's official cloud API. As of mid-2026:

- **BLE-level RE is mature for the WHOOP 4.0**: GATT layout, CRC-32, packet framing, basic commands (alarm, HR broadcast, history dump, battery, version, time set) are all documented and re-implemented in 3+ languages.
- **High-frequency PPG + accelerometer streaming is partially decoded**: 96-byte sensor packets are parsed for HR / RR / SpO2 / skin temp, but bytes 20–91 of the realtime packet (gyro, respiration waveform, raw PPG) are still labelled "TODO" in every public repo I could find. ([christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader))
- **WHOOP 5.0 / MG is largely unanalysed in public**: hardware reviews note a new sensor PCB (`820-000100`) and 26 Hz sampling, but no public project has confirmed BLE protocol changes. ([the5krunner](https://the5krunner.com/2025/06/16/whoop-4-0-vs-whoop-5-0-sensor-architecture-changes-detailed-technical-content/), [istanbul2023.org](https://www.istanbul2023.org/forensic-analysis-of-the-whoop/))
- **Algorithms (recovery, strain, sleep staging) are not openly replicated** — community projects use approximations (Baevsky stress index, Edwards TRIMP, RMSSD-only HRV) where WHOOP uses proprietary ML.
- **Cloud API tooling is over-represented**: at least 10 repos exist that just wrap the official OAuth v2 API. Useful for analytics, useless for "no-subscription" use cases.
- **Legal posture is permissive but tightening**: no documented C&D against an RE author so far, but WHOOP sued Bevel in March 2026 (UI / patent grounds) and the FDA issued a warning letter in July 2025 about Blood Pressure Insights. Building an interoperable client likely sits inside the DMCA §1201(f) interoperability carve-out — but cloning the UI/UX is now demonstrably risky. ([the5krunner](https://the5krunner.com/2026/04/04/whoop-sues-bevel/), [FDA](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025))

---

## 2. Active reverse-engineering projects

### 2.1 Tier 1 — Original protocol work (BLE / device-side)

#### **jogolden/whoomp** (the "founder" project)
- **URL:** https://github.com/jogolden/whoomp
- **Languages:** JavaScript (47.5%), Python (45.2%), HTML (7.2%)
- **Stars / Forks:** 87 / 15
- **Status:** Active. Has a live Web Bluetooth demo at jogolden.github.io/whoomp/.
- **What's decoded:** GATT service map, CRC-32 framing, command structure, HR + RR live stream, basic HRV (time + frequency domain), historical data extraction, sleep tracking parsing. Owner explicitly seeks contributors for HR cleaning, HRV scoring, sleep staging.
- **Origin story:** Reverse-engineered the Android app (JADX), pulled firmware, then re-implemented protocol in Python + JS with `bleak` / Web Bluetooth. Tweet announcing the project: [@jogold32, Jan 2025](https://x.com/jogold32/status/1875993250798182423).
- **Citation:** [GitHub - jogolden/whoomp](https://github.com/jogolden/whoomp), [johnfitz.me/projects](https://johnfitz.me/projects/)

#### **bWanShiTong/reverse-engineering-whoop-post**
- **URL:** https://github.com/bWanShiTong/reverse-engineering-whoop-post
- **Format:** Markdown blog/book (rendered at mintlify.wiki/bWanShiTong)
- **Stars / Forks:** 199 / 10
- **Status:** Active. Highest-trafficked RE write-up; basically the canonical reference document.
- **What's documented:** BLE recon methodology (Wireshark + adb HCI snoop), GATT service `61080000-...`, the five custom characteristics (CMD_TO_STRAP, CMD_FROM_STRAP, EVENTS_FROM_STRAP, DATA_FROM_STRAP, MEMFAULT), 5-byte header `aa 10 00 57 23`, CRC-32 with polynomial `0x04C11DB7` and **non-standard XOR-out `0xF43F44AC`**, packet counters, category bytes, on/off flags, sync stop-and-wait flow, 96-byte payload structure, command catalog (alarm, activity start/stop, HR broadcast toggle, health monitor, reboot, erase), event types.
- **Citation:** [GitHub - bWanShiTong/reverse-engineering-whoop-post](https://github.com/bWanShiTong/reverse-engineering-whoop-post), [Mintlify Wiki](https://mintlify.wiki/bWanShiTong/reverse-engineering-whoop-post/getting-started/prerequisites)

#### **bWanShiTong/openwhoop**
- **URL:** https://github.com/bWanShiTong/openwhoop
- **Language:** Rust (92.3%), Jupyter (7.6%)
- **Stars / Forks:** 163 / 24
- **Status:** Active. The most feature-complete open client today.
- **What's shipped:** scan, download-history, detect-events (sleep + exercise), calculate-stress (Baevsky index), calculate-spo2, calculate-skin-temp, strain (Edwards TRIMP), respiratory rate derivation, set-alarm, sync, IMU enable, download-firmware, version, restart, erase, completions. SQLite + Postgres support. Multi-database merge. Six open issues, 43 commits to master.
- **Tagline:** "CLI allowing you to use your Whoop 4.0 without subscription and without data leaving your device."
- **Citation:** [GitHub - bWanShiTong/openwhoop](https://github.com/bWanShiTong/openwhoop), [bWanShiTong overview](https://github.com/bWanShiTong)

#### **bWanShiTong/openwhoop-app**
- **URL:** https://github.com/bWanShiTong/openwhoop-app
- **Stack:** SvelteKit + Tauri 2 + Rust, targets Android + iOS.
- **Stars / Forks:** 5 / —
- **Status:** Early — only 2 commits, no releases, no issues.
- **What's planned:** BLE scan + pair, background sync to SQLite, daily dashboards (sleep / strain / activities / stress), real-time HR + stress, activity CRUD, DB export/import.
- **Citation:** [GitHub - bWanShiTong/openwhoop-app](https://github.com/bWanShiTong/openwhoop-app)

#### **bWanShiTong/whoop-simulator**
- **URL:** https://github.com/bWanShiTong/whoop-simulator
- **Language:** Rust
- **Stars / Forks:** 12 / 1
- **Status:** Experimental. "Device Honey Pot" — simulates a WHOOP strap's BLE profile so the official app sees it as real, in order to capture what commands the app sends.
- **Why it matters:** This is the right idea — flipping the direction of RE — but it's incomplete. If we wanted to bottom out every command code, this is the seed to build on.
- **Citation:** [GitHub - bWanShiTong/whoop-simulator](https://github.com/bWanShiTong/whoop-simulator)

#### **bWanShiTong/reverse-engineering-whoop**
- **URL:** https://github.com/bWanShiTong/reverse-engineering-whoop
- **Language:** Python (56.9%), TypeScript (39.4%)
- **Stars / Forks:** 52 / 3
- **Status:** Incomplete. Author explicitly notes "I can't identify algo used to calculate checksum, so I can't test these commands" — this was the precursor to the `-post` repo that did crack CRC.
- **Citation:** [GitHub - bWanShiTong/reverse-engineering-whoop](https://github.com/bWanShiTong/reverse-engineering-whoop)

#### **christianmeurer/whoop-reader**
- **URL:** https://github.com/christianmeurer/whoop-reader
- **Language:** Python (100%)
- **Stars / Forks:** 5 / —
- **Status:** Single-shot project (1 commit on master), but well-documented.
- **What's decoded:** Heart rate, R-R interval, SpO2, skin temperature, battery level, device info. **Candidate features (admitted unconfirmed):** accelerometer XYZ, motion intensity, PPG amplitude, ambient light, PPG signal quality. Confirms 96-byte packets on `61080004-...` with last 4 bytes = CRC-32 of preceding 92. Bytes 20–91 explicitly "not yet decoded."
- **Legal posture:** Explicitly cites DMCA §1201(f) interoperability exemption.
- **Citation:** [GitHub - christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader)

#### **nekkid-yoga/Whoop4.0BatteryReset**
- **URL:** https://github.com/nekkid-yoga/Whoop4.0BatteryReset
- **Language:** C# (100%), Windows x64 binary
- **Stars / Forks:** 8 / —
- **What's decoded:** USB serial protocol to the battery pack (not BLE). Discovered a reset command that revives bricked battery packs. Notable as the **only** project that touches the charger firmware.
- **Citation:** [GitHub - nekkid-yoga/Whoop4.0BatteryReset](https://github.com/nekkid-yoga/Whoop4.0BatteryReset)

---

### 2.2 Tier 2 — Cloud API wrappers (no BLE)

These projects all rely on the official OAuth v2 developer API ([developer.whoop.com/api](https://developer.whoop.com/api/)). They're useful for analytics dashboards / data science, useless for offline / no-subscription use cases. Listed for completeness because some have decent codebases we could lift OAuth/normalization code from.

| Project | Language | Stars | Last commit | Notes |
|---|---|---|---|---|
| [hedgertronic/whoop](https://github.com/hedgertronic/whoop) | Python | 99 | Oct 2022 (dormant) | Earliest established API client; Pandas integration |
| [felixnext/whoopy](https://github.com/felixnext/whoopy) | Python | 5 | Jul 2025 | Async/await, Pydantic models, v2 API support |
| [totocaster/whoopy](https://github.com/totocaster/whoopy) | Go | 0 | Active | CLI wrapping v2, designed for agents; JSON-first |
| [marekq/go-whoop](https://github.com/marekq/go-whoop) | Go | 13 | Active | OAuth2 + cycles/recovery/sleep/workouts |
| [jacc/whoop-re](https://github.com/jacc/whoop-re) | Markdown | 4 | — | Docs of internal (not v2) endpoints: coaching-service, journals, sports history |
| [jjur/whoop-sleep-HR-data-api](https://github.com/jjur/whoop-sleep-HR-data-api) | Python | 4 | Oct 2025 | **Hits internal `app.whoop.com` API**, not the developer one — closer to "real" RE |
| [colinmacon/WhoopAPI-Wrapper](https://github.com/colinmacon/WhoopAPI-Wrapper) | Python | — | — | Older internal-API wrapper |
| [zachgodsell93/Get-My-Whoop](https://github.com/zachgodsell93/Get-My-Whoop) | Python | — | — | Sync utility |
| [irickman/whoop-downloader](https://github.com/irickman/whoop-downloader) | R/Python | — | — | Downloader functions |
| [ald0405/whoop-data](https://github.com/ald0405/whoop-data) | Python | 13 | Apr 2026 | ETL + LangGraph AI agent + FastAPI + Telegram bot |
| [juanmagdev/gnome-whoop-extension](https://github.com/juanmagdev/gnome-whoop-extension) | JavaScript | 3 | — | GNOME panel widget, OAuth2+PKCE |
| [Afthab33/whoop](https://github.com/Afthab33/whoop) | JavaScript/React | 4 | — | Web app rebuild with GPT-4o AI coach |
| [patrickloeber/whoop-analyzer](https://github.com/patrickloeber/whoop-analyzer) | Python | — | — | Workout analytics |

Citation: [GitHub Topics: whoop](https://github.com/topics/whoop)

---

### 2.3 Tier 3 — MCP servers (Claude / LLM integration)

A surprisingly active sub-community emerged late 2024 → 2026 around exposing WHOOP data as MCP tools. All wrap the official OAuth API.

| Project | Language | Stars | Notes |
|---|---|---|---|
| [JedPattersonn/whoop-mcp](https://github.com/JedPattersonn/whoop-mcp) | TypeScript | — | Production-grade |
| [nissand/whoop-mcp-server-claude](https://github.com/nissand/whoop-mcp-server-claude) | TypeScript | 9 | 18+ endpoints, full OAuth |
| [yuridivonis/whoop-mcp-server](https://github.com/yuridivonis/whoop-mcp-server) | TypeScript | 4 | Whoop → Claude |
| [ctvidic/whoop-mcp-server](https://github.com/ctvidic/whoop-mcp-server) | — | — | |
| [RomanEvstigneev/whoop-mcp-server](https://smithery.ai/servers/RomanEvstigneev/whoop-mcp-server) | — | — | Smithery-hosted |
| [cbellbell-spin/whoop-mcp](https://mcpservers.org/servers/cbellbell-spin/whoop-mcp) | — | — | |
| [mcpforwhoop.com](https://mcpforwhoop.com/) | — | — | Hosted commercial MCP |

Citation: [Merge.dev guide](https://www.merge.dev/blog/whoop-mcp-claude-code)

---

### 2.4 Tier 4 — Hardware-alternative / clone projects

Not strictly RE, but adjacent and worth knowing.

#### **uqjwy/whoop-alternative**
- **URL:** https://github.com/uqjwy/whoop-alternative
- **What it is:** Open-source hardware (nRF52840 + MAX86141 PPG + BMA400 IMU + MAX30205 skin temp + INA333 EDA) with Zephyr firmware and a Flutter app. MIT licence.
- **Status:** 22 commits across four phases — eval / firmware MVP / hardware v1 / mobile app.
- **Citation:** [GitHub - uqjwy/whoop-alternative](https://github.com/uqjwy/whoop-alternative)

#### **stacksjs/ts-health**
- **URL:** https://github.com/stacksjs/ts-health
- **What it is:** Generic TypeScript library covering many wearables; mentions WHOOP among supported.
- **Stars:** 4

---

### 2.5 Hacker News / dev community surface area

- [HN: Reverse Engineering Whoop 4.0](https://news.ycombinator.com/item?id=41723890) — the bWanShiTong post, October 2024.
- [HN: Whoop 5 and Whoop MG](https://news.ycombinator.com/item?id=43925301) — May 2025 launch discussion; multiple commenters reference whoomp / openwhoop as the way to avoid the subscription.
- [johnfitz.me/projects](https://johnfitz.me/projects/) — jogolden's personal project page.
- [r/whoop](https://subredditstats.com/r/whoop) — ~98K members, mostly user discussion; occasional RE threads.
- Sensor-Lab / forensic write-up: [istanbul2023.org/forensic-analysis-of-the-whoop](https://www.istanbul2023.org/forensic-analysis-of-the-whoop/) — independent technical breakdown of Maxim PPG AFE, ARM Cortex-M4, nRF52840 SoC, BLE GATT, sync, strain algorithm.
- [smarthome724 forensic analysis](https://www.smarthome724.com/post/detail/387/) — sensor physics + signal integrity write-up (motion artifact failure modes).

I could not find any conference talks specifically on WHOOP RE (no DEF CON / RECON / Black Hat presentations as of May 2026 — confirmed via Google searches with site:defcon.org / site:recon.cx).

---

## 3. Decoded protocol details (consolidated)

This is what's nailed down across the public corpus. Anything not in this section is either undocumented or partially decoded.

### 3.1 BLE GATT

| UUID | Name | Handle | Direction | Purpose |
|---|---|---|---|---|
| `61080000-8d6d-82b8-614a-1c8cb0f8dcc6` | Custom service | — | — | Container |
| `61080002-...` | CMD_TO_STRAP | 0x0010 | Write | App→strap commands |
| `61080003-...` | CMD_FROM_STRAP | 0x0012 | Notify | Strap→app responses |
| `61080004-...` | EVENTS_FROM_STRAP | 0x0015 | Notify | Async events (alarm taps, etc.) |
| `61080005-...` | DATA_FROM_STRAP | 0x0018 | Notify | 96-byte sensor packets |
| `61080007-...` | MEMFAULT | 0x001b | Notify | Crash/fault telemetry |

Plus the standard BLE **Heart Rate Service** for HR broadcast (compatible with Peloton, Zwift, Wahoo, Concept2 — but **not** ANT+). Citation: [WHOOP HR Broadcast docs](https://support.whoop.com/s/article/Heart-Rate-Broadcast), [christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader).

### 3.2 Framing

- Header: `aa 10 00 57 23` (SOF + length + category bytes), followed by packet counter, on/off flag, payload, 4-byte CRC at end.
- 96-byte sensor packets: 31-byte header + raw PPG + accelerometer; bytes 20-91 **not fully decoded** in any public repo.
- Sync uses stop-and-wait flow control; terminal packet contains Unix timestamp + batch number + checksum, requires ACK.
- Live activity streaming: 24-byte packets every 1s during "Live Activity" — HR + IBI + timestamp.

Citation: [istanbul2023.org forensic analysis](https://www.istanbul2023.org/forensic-analysis-of-the-whoop/), [bWanShiTong/reverse-engineering-whoop-post](https://github.com/bWanShiTong/reverse-engineering-whoop-post).

### 3.3 CRC-32

The single biggest blocker for newcomers. WHOOP uses a non-standard variant:
- Polynomial: `0x04C11DB7`
- Input + result reflected
- **XOR-out: `0xF43F44AC`** (not the usual `0xFFFFFFFF`)
- Recovered using [CRCBeagle](https://github.com/hbldh/CRCBeagle)

Citation: [bWanShiTong protocol/checksum-crc](https://github.com/bWanShiTong/reverse-engineering-whoop-post) (Mintlify-hosted).

### 3.4 Confirmed commands

| Command | Status | First public RE |
|---|---|---|
| Activity start/stop | Documented | bWanShiTong |
| Alarm set / clear | Documented (`0xaa 0x08 ... 23 91 45 01 dd861b95` = alarm off example) | bWanShiTong |
| HR broadcast on/off | Documented | bWanShiTong |
| Health monitor toggle | Documented | bWanShiTong |
| Device reboot | Documented | bWanShiTong |
| Erase data | Documented | bWanShiTong |
| Get battery (cmd 26) | Documented | OpenWhoop-2 / whoomp |
| Get/Set clock | Documented | OpenWhoop-2 |
| Get version | Documented | OpenWhoop-2 |
| History download | Documented | OpenWhoop-2 / OpenWhoop (Rust) |
| Enable IMU | Documented | OpenWhoop (Rust) |
| Download firmware | Documented | OpenWhoop (Rust) |
| **OTA firmware upload** | NOT in any public repo | — |
| **Pairing/virgin-mode flow** | NOT documented | — |
| **High-frequency sync cmd 96/97** | Only in local OpenWhoop-2 README, not in public repos | — |

### 3.5 Hardware (for context)

- WHOOP 4.0: Nordic nRF52840 SoC (Cortex-M4 64 MHz), Maxim MAX86171 PPG AFE, 3 green + 1 red + 1 IR LEDs, 4 photodiodes, 3-axis accelerometer + 3-axis gyroscope, skin temp sensor, capacitive touch. Citation: [Nordic press](https://www.nordicsemi.com/Nordic-news/2022/07/The-WHOOP-4-uses-Nordics-nRF52840-SoC).
- WHOOP 5.0 (May 2025): "7% smaller, 60% faster processor, sensors 10× less power." New PCB `820-000100`. 26 Hz sampling for HR/motion/temp. Citation: [the5krunner Whoop 4→5 sensor changes](https://the5krunner.com/2025/06/16/whoop-4-0-vs-whoop-5-0-sensor-architecture-changes-detailed-technical-content/).
- WHOOP MG: PCB `820-000188`, adds single-lead ECG via clasp contact pads + BP estimation via PAT proxies from PPG. Hardware likely shared with 5.0 with ECG enabled in firmware. Citation: [istanbul2023.org](https://www.istanbul2023.org/forensic-analysis-of-the-whoop/).

---

## 4. Feature matrix

Columns are the projects that touch the device (or its internal cloud) directly — Tier 2 cloud-API wrappers are excluded because their feature set is whatever WHOOP exposes via OAuth. Local projects (our repo) shown as **Noop**. Legend: ✅ shipped • 🟡 partial • ❌ not present • ❓ unknown.

| Feature | Noop (local) | OpenWhoop (Rust) | OpenWhoop-2 (Py) | whoomp (JS/Py) | whoop-reader | reverse-eng-whoop-post (doc) | whoop-simulator | bWan reverse-eng-whoop | jjur/whoop-sleep-HR | uqjwy/whoop-alt (hw clone) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Connectivity & framing** | | | | | | | | | | |
| BLE scan & connect | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | 🟡 | ❌ (cloud) | n/a (own HW) |
| CRC-32 (custom poly + XOR) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | n/a |
| Packet framing (`aa 10 00 57 23`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | n/a |
| Multi-notification reassembly | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ (doc) | ❓ | ❌ | ❌ | n/a |
| **Commands** | | | | | | | | | | |
| Battery level (cmd 26) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❓ | ❌ | ✅ (via app) | n/a |
| Event-3 battery | ❌ | ❓ | ❓ | 🟡 | ❓ | ❓ | ❓ | ❌ | ❌ | n/a |
| Event-63 extended battery | ❌ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❌ | ❌ | n/a |
| Get/Set clock | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❓ | ❌ | ❌ | n/a |
| Get firmware version | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❓ | ❌ | ❌ | n/a |
| History download | ❌ (planned) | ✅ | ✅ | ✅ | ❌ (live only) | ✅ | n/a | 🟡 | ✅ (cloud) | n/a |
| High-freq sync (cmd 96/97) | ❌ | ❓ | ✅ | 🟡 | ❌ | ❓ | ❌ | ❌ | ❌ | n/a |
| Set alarm (haptic) | ❌ | ✅ | 🟡 | ✅ | ❌ | ✅ | ❓ | ❌ | ❌ | n/a |
| HR broadcast toggle | ❌ | 🟡 | 🟡 | ✅ | ❌ | ✅ | ❓ | ❌ | ❌ | n/a |
| Activity start/stop | ❌ | 🟡 | ❌ | ✅ | ❌ | ✅ | ❓ | ❌ | ✅ (cloud) | n/a |
| Erase data | ❌ | ✅ | ❌ | 🟡 | ❌ | ✅ | ❓ | ❌ | ❌ | n/a |
| Restart device | ❌ | ✅ | ❌ | 🟡 | ❌ | ✅ | ❓ | ❌ | ❌ | n/a |
| Enable IMU streaming | ❌ | ✅ | ❌ | ❓ | 🟡 | ❓ | ❓ | ❌ | ❌ | n/a |
| Download firmware blob | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a |
| Battery-pack USB reset | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a (separate project: Whoop4.0BatteryReset) |
| **Sensor data decoding** | | | | | | | | | | |
| Heart rate (live) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | 🟡 | ✅ | ✅ |
| Heart rate (historical) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | n/a | 🟡 | ✅ | ✅ |
| RR / IBI intervals | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | 🟡 | ✅ | ✅ |
| HRV (RMSSD) | ❌ | ✅ | ✅ | ✅ | 🟡 | ✅ | n/a | ❌ | ✅ | ✅ |
| HRV (frequency-domain LF/HF) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | n/a | ❌ | ❌ | 🟡 |
| SpO2 | ❌ | ✅ (Beer-Lambert) | ✅ | 🟡 | ✅ | 🟡 | n/a | ❌ | ✅ | 🟡 |
| Skin temperature | ❌ | ✅ | ✅ | ❌ | ✅ | 🟡 | n/a | ❌ | ❌ | ✅ |
| Accelerometer XYZ | ❌ | 🟡 | 🟡 | ❌ | 🟡 (unconfirmed) | ❌ | n/a | ❌ | ❌ | ✅ |
| Gyroscope | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ❌ | ❌ | n/a |
| Raw PPG waveform | ❌ | 🟡 (stored) | 🟡 (stored) | ❌ | 🟡 (unconfirmed) | ❌ | n/a | ❌ | ❌ | ✅ |
| Respiratory rate | ❌ | ✅ (derived) | ❌ | ❌ | ❌ | ❌ | n/a | ❌ | ✅ (cloud) | 🟡 |
| Ambient light / PPG quality | ❌ | ❌ | ❌ | ❌ | 🟡 (unconfirmed) | ❌ | n/a | ❌ | ❌ | 🟡 |
| **Algorithms (derived)** | | | | | | | | | | |
| Sleep state inference | ❌ | ✅ (event-based) | ✅ | 🟡 | ❌ | ❌ | n/a | ❌ | ✅ (cloud) | ✅ |
| Sleep staging (Wake/Light/REM/SWS) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ❌ | ✅ (cloud-derived) | 🟡 |
| Strain score (Edwards TRIMP) | ❌ | ✅ | ✅ | 🟡 | ❌ | ❌ | n/a | ❌ | ✅ (cloud) | 🟡 |
| Recovery score | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ❌ | ✅ (cloud) | 🟡 |
| Stress (Baevsky index) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | n/a | ❌ | ❌ | 🟡 |
| Exercise/activity detection | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | n/a | ❌ | ✅ (cloud) | ✅ |
| **System** | | | | | | | | | | |
| Pairing / virgin mode | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a |
| OTA firmware upload | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a |
| BLE bonding/encryption | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❓ | ❌ | n/a | n/a |
| Cloud auth (OAuth2) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (internal API) | ❌ |
| ECG (WHOOP MG) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a |
| BP estimation (WHOOP MG) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a |
| WHOOP 5.0 support confirmed | ❓ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❓ | n/a |

**Headline take:** Every cell that's ❌ across all device-touching columns is genuinely unsolved in public. The biggest gaps are: gyroscope, OTA, pairing/virgin mode, sleep staging, recovery score, WHOOP 5.0/MG support, ECG, BP.

---

## 5. WHOOP's official feature surface (mid-2026)

What we'd be competing with if we wanted feature parity. Pulled from WHOOP's marketing and 2026 release notes ([whoop.com/2026-whats-new](https://www.whoop.com/us/en/thelocker/2026-whats-new/), [whoop.com/everything-launched-2025](https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/), [developer.whoop.com](https://developer.whoop.com/docs/whoop-101/)).

### 5.1 Core scores (the "three rings")
- **Recovery (0–100%)** — proprietary algorithm combining RMSSD HRV, RHR, respiratory rate, sleep, skin temp, SpO2. Calculated during deepest sleep.
- **Strain (0–21, log scale)** — Borg-derived; HR-zone time × intensity weighting, plus muscular load from velocity-based training tech (PUSH acquisition).
- **Sleep (need, performance, consistency, efficiency)** — 30-sec epochs classified into Wake/Light/REM/SWS via ML on PPG+IMU; ~86–89% agreement with PSG for 2-stage, 64% overall for 4-stage. Citation: [Whoop sleep accuracy](https://www.whoop.com/us/en/thelocker/how-well-whoop-measures-sleep/).

### 5.2 Health Monitor
- HRV (during deep sleep), RHR, SpO2, skin temperature, respiratory rate. Compared against personalized baseline; surfaces deviation alerts ("getting sick").

### 5.3 WHOOP MG / 5.0 add-ons (2025)
- **ECG (FDA-cleared, K243236)** — single-lead, AFib detection + Irregular Heart Rhythm Notifications.
- **Blood Pressure Insights** — daily systolic/diastolic estimates from PAT/PPG, 14-day calibration period, **subject to FDA warning letter July 14 2025** ([FDA warning](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025)).
- 14-day battery; Healthspan / Whoop Age (longevity scoring).

### 5.4 Software features
- **Journal** — 140+ behaviours; correlations after 5+ yes/no logs over 90 days. Citation: [WHOOP Journal](https://www.whoop.com/us/en/thelocker/the-whoop-journal/).
- **Behaviour Insights + Trends** (Mar 2026) — calendar of logged behaviours, streak detection.
- **Coach** — LLM chat with memory across conversations, sports-science grounded.
- **Strength Trainer** — muscular load tracking; passive MSK in Feb 2026 (no logging needed for weightlifting/HIIT and ~10 activity types).
- **Auto-detection** — ML model trained on logged vs unlogged activity periods; min duration dropped from 15→10 min in Jan 2026.
- **Heart Rate Broadcast** — standard BLE HR profile; works with Peloton, Zwift, Wahoo, Concept2 (no ANT+).
- **Menstrual Cycle Insights** — cycle-phase-aware reference ranges for Estradiol/LH/FSH.
- **Advanced Labs** — bloodwork integration; pillar-level biomarker mapping.
- **Jet-Lag coaching, AI Exercise Linking** — added 2026.
- **VO2max** — three-tier (passive / GPS-augmented / ground-truth calibrated); ±3.3–3.7 mL/kg/min vs lab. Citation: [WHOOP VO2 Max](https://support.whoop.com/s/article/VO2-Max).

### 5.5 Official Developer API (v2)
- OAuth2 with scopes: `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement`.
- Endpoints: `/v2/cycle`, `/v2/cycle/{id}/sleep`, `/v2/cycle/{id}/recovery`, `/v2/activity/sleep`, `/v2/activity/workout`, `/v2/user/measurement/body`, `/v2/user/profile/basic`, `DELETE /v2/user/access`.
- Rate limits: `X-RateLimit-Limit: 100;window=60, 10000;window=86400`. Citation: [WHOOP API docs](https://developer.whoop.com/api/), [Rate limiting docs](https://developer.whoop.com/docs/developing/rate-limiting/).

---

## 6. What's HARD to replicate (cloud-side algorithms)

Decoding the wire is the easy part; **the algorithms are the moat**.

1. **Sleep staging (Wake/Light/REM/SWS classifier)**
   - WHOOP uses ML trained against PSG; published agreement metrics (above). Inputs: PPG (HR + IBI), accelerometer, respiratory rate.
   - Open replication: needs labelled PSG corpus (e.g. MESA, SHHS, PhysioNet); models exist in literature (e.g. Walch 2019 "Sleep stage prediction from heart rate variability") at ~70–80% 4-class accuracy — workable. Effort: 1–2 engineer-months.

2. **Recovery score derivation**
   - Black-box weighting of RHR / HRV / RR / sleep / skin temp / SpO2 against a personalised baseline.
   - Open replication: doable but requires personal-baseline learning + an opinionated scoring function. Less ML, more "tuned heuristic." Effort: 1–2 weeks.

3. **Strain score (calibrated for 0–21 log scale)**
   - Edwards TRIMP analogue exists in OpenWhoop (Rust) — sufficient for an MVP but won't match WHOOP's numbers because WHOOP scales by personal max HR and adds muscular-load term.
   - Open replication: TRIMP variant + max-HR calibration; muscular load from accel-IMU integration is the hard part. Effort: 2–4 weeks for cardio, much longer for muscular load.

4. **Auto-detection of activities**
   - ML on accel + HR time-series; WHOOP trained on user labels.
   - Open replication: harder than it looks — need labelled data, or use windowed HR-zone heuristics with a 10-min minimum duration. Effort: 1+ months for a credible classifier.

5. **VO2max estimation**
   - Three-tier system (passive / GPS / lab). Passive uses HR-velocity slope at sub-max efforts; standard sports-science methods (Tanaka, Astrand) get close. Effort: 1–2 weeks.

6. **Stress detection**
   - WHOOP uses HRV-derived autonomic balance. OpenWhoop uses Baevsky stress index — solid open analogue. Effort: minimal — already done.

7. **Behaviour-to-recovery correlation engine**
   - Requires daily journal UX + statistical correlation after N samples. Algorithmically trivial; UX-heavy.

8. **Skin-temp variability baseline**
   - Need 7–14 days of nightly samples + EWMA. Effort: trivial.

9. **AFib detection from ECG (WHOOP MG only)**
   - Heavy FDA territory. Don't replicate. Even reading ECG data off the strap presumes RE of new BLE characteristics that nobody's done publicly.

10. **Blood pressure from PPG / PAT** — research-grade, controversial (FDA letter). **Skip.**

---

## 7. License / legality

### 7.1 What's permissible
- **DMCA §1201(f) interoperability exemption** — explicitly invoked by christianmeurer/whoop-reader and the community consensus is that BLE protocol reverse engineering for "enabling interoperability of an independently created computer program with other programs" is protected. Citation: [Leppard Law DMCA RE](https://leppardlaw.com/federal/computer-crimes/evaluating-the-role-of-reverse-engineering-in-dmca-compliance-under-us-federal-law/), [EFF Unintended Consequences](https://www.eff.org/pages/unintended-consequences-fifteen-years-under-dmca).
- WHOOP's official **Terms of Service** prohibit RE of the *app*, but the device firmware is silicon you bought — under US law, hardware-level RE for interop is generally protected.
- No public C&D or DMCA takedown against any of the projects listed in §2. bWanShiTong's repos have been up since at least 2024 with rising star counts and no apparent legal action.

### 7.2 What's risky
- **Cloning the WHOOP UI/UX**: WHOOP sued Bevel in March 2026 — *trade dress + four patents covering "biometric data processing and recovery scoring"*. Even though Bevel doesn't touch the strap, this signals WHOOP will defend its app patents aggressively. We should:
  - Avoid copying the three-ring home screen exactly.
  - Avoid using identical metric vocabulary ("Strain", "Recovery") — those are trademarks.
  - Consult counsel before publishing a marketing site that looks too WHOOP-like.
  Citation: [the5krunner: Whoop sues Bevel](https://the5krunner.com/2026/04/04/whoop-sues-bevel/), [Bevel response](https://x.com/bevel_health/status/2040101786061541424).
- **WHOOP Bug Bounty exists on HackerOne** ([hackerone.com/whoop_bug_bounty](https://hackerone.com/whoop_bug_bounty?type=team)) — touching their cloud infrastructure (auth bypass, data leaks) is in scope; touching the device for interop is not.
- **FDA jurisdiction (Blood Pressure Insights)**: don't replicate any feature that could be construed as "medical device" — BP estimation, AFib detection, anything diagnostic. Stick to "wellness" framing. Citation: [FDA warning letter July 14 2025](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025).
- **Trademarks**: "WHOOP" is registered; our project should not include it in name (note bWanShiTong went with "openwhoop" and jogolden with "whoomp" — both flirt with this but neither has been challenged).

### 7.3 Privacy / data
- A 2025 class-action alleged WHOOP shared biometric data with third-party trackers; pending. Citation: [Hedwig blog](https://blog.hedwig.sh/whoop-alternatives/). This is the strongest user-facing argument for an offline open-source client.

---

## 8. Protocol-reversing techniques in current use

Aggregated from the toolchain stacks reported in the various READMEs.

1. **Android HCI snoop logging** — `adb shell setprop persist.bluetooth.btsnoopenable true`, pull `/sdcard/btsnoop_hci.log`, open in Wireshark, filter `btatt`. The single most useful technique.
2. **`gatttool` / `bluetoothctl`** on Linux — for sending raw hex to specific handles.
3. **nRF Sniffer + Wireshark** — passive over-the-air capture; useful when bonding is involved.
4. **JADX / APKTool / Frida** for the Android app — used to recover *names* (CMD_TO_STRAP etc.) and command code constants. Not yet leveraged publicly to extract ML models.
5. **CRCBeagle** — recovered the unusual XOR-out value `0xF43F44AC`.
6. **bleak (Python)**, **Web Bluetooth API (JS)**, **btleplug / bluester (Rust)** — the three dominant BLE client stacks in this ecosystem.
7. **Honeypot-style RE** — whoop-simulator (Rust) mimics a strap so the official app sends *its* commands at *you*. Underutilised; could be the cleanest path to enumerate the remaining ~40% of unknown commands.

---

## 9. Recommendations for our roadmap

Ranked by **(impact for users) × (we can lift existing work) ÷ (effort)**. Top items first.

### Tier S — must-have, low effort because work exists

1. **High-frequency sync (cmd 96/97) in the public code paths.** Our local OpenWhoop-2 has it; no public project does. ~90× faster history download is a huge UX win and a clear competitive moat over the publicly known projects. Effort: 1 week to port + harden.

2. **Sleep staging classifier (Wake/Light/REM/SWS).** Nobody open has this. Use Walch et al.'s heart-rate-variability + accelerometer features on labelled PSG datasets. Targeted accuracy ~70–75% 4-class, ~85% 2-class — meets or beats WHOOP's published numbers. Effort: 4–6 weeks; biggest impact-per-week of any item on this list.

3. **Recovery score (open).** Tuned heuristic combining RMSSD, RHR, RR, sleep efficiency, skin-temp anomaly. We don't need to match WHOOP exactly; we need to produce a defensible daily 0–100. Effort: 2 weeks.

### Tier A — meaningful, moderate effort

4. **Battery polling unification + event-3 / event-63 decoding.** Whoomp already does periodic 30-sec polls; our local OpenWhoop has cmd-26. The event-driven battery packets (event 3, event 63) are still unparsed locally. Decoding them lets us drop polling entirely. Effort: ~3 days of capture + diff with simulator.

5. **Activity auto-detection (open).** HR-zone + accel windowing classifier with a 10-min minimum. Doesn't need ML — heuristic wins. Effort: 2 weeks.

6. **Stress + strain parity with OpenWhoop (Rust).** Port Baevsky stress index and Edwards TRIMP — both already implemented in the Rust crate. We have algos but should align with the canonical implementations. Effort: 1 week.

### Tier B — strategic, higher effort

7. **Pairing / virgin-mode flow.** Nobody has this publicly. Required for "buy a used WHOOP 4.0 on eBay, pair to our app." Approach: use whoop-simulator to enumerate the app→strap pairing handshake. Effort: 4–8 weeks; this is the killer feature for the no-subscription crowd because right now you still need the WHOOP app to do initial bond.

8. **Gyroscope + raw PPG waveform decoding (bytes 20-91 of the 96-byte packet).** Open-ended — needs experimental capture against known motions. Worthwhile because it unlocks better strain/respiration/HRV estimates. Effort: 2-4 weeks of structured capture.

9. **WHOOP 5.0 confirmation.** As of May 2026 no public project has confirmed 5.0 works on the existing protocol. We should buy a 5.0 unit and verify the GATT / framing / CRC. Effort: 1 week.

10. **OTA firmware update mechanism (read-only).** Decode the OTA protocol so we can at least *detect* a firmware version and *block* upgrades that would brick the open client. Don't try to push firmware. Effort: 2 weeks.

### Tier C — explicitly out of scope

- ECG decoding (FDA territory, only on MG).
- Blood Pressure (FDA warning letter — bad neighborhood).
- Anything that copies WHOOP's three-ring UI or uses the names "Recovery"/"Strain" as primary scores (Bevel lawsuit signal).

---

## 10. Cited sources (consolidated)

### Primary repos
- [jogolden/whoomp](https://github.com/jogolden/whoomp)
- [bWanShiTong/openwhoop](https://github.com/bWanShiTong/openwhoop)
- [bWanShiTong/openwhoop-app](https://github.com/bWanShiTong/openwhoop-app)
- [bWanShiTong/reverse-engineering-whoop-post](https://github.com/bWanShiTong/reverse-engineering-whoop-post)
- [bWanShiTong/reverse-engineering-whoop](https://github.com/bWanShiTong/reverse-engineering-whoop)
- [bWanShiTong/whoop-simulator](https://github.com/bWanShiTong/whoop-simulator)
- [christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader)
- [nekkid-yoga/Whoop4.0BatteryReset](https://github.com/nekkid-yoga/Whoop4.0BatteryReset)
- [uqjwy/whoop-alternative](https://github.com/uqjwy/whoop-alternative)
- [Afthab33/whoop](https://github.com/Afthab33/whoop)
- [GitHub Topic: whoop](https://github.com/topics/whoop)

### Cloud / API wrappers
- [hedgertronic/whoop](https://github.com/hedgertronic/whoop)
- [felixnext/whoopy](https://github.com/felixnext/whoopy)
- [totocaster/whoopy](https://github.com/totocaster/whoopy)
- [marekq/go-whoop](https://github.com/marekq/go-whoop)
- [jacc/whoop-re](https://github.com/jacc/whoop-re)
- [jjur/whoop-sleep-HR-data-api](https://github.com/jjur/whoop-sleep-HR-data-api)
- [ald0405/whoop-data](https://github.com/ald0405/whoop-data)
- [juanmagdev/gnome-whoop-extension](https://github.com/juanmagdev/gnome-whoop-extension)
- [JedPattersonn/whoop-mcp](https://github.com/JedPattersonn/whoop-mcp)
- [nissand/whoop-mcp-server-claude](https://github.com/nissand/whoop-mcp-server-claude)

### WHOOP official
- [Developer API v2](https://developer.whoop.com/api/)
- [API Rate Limiting](https://developer.whoop.com/docs/developing/rate-limiting/)
- [WHOOP 101](https://developer.whoop.com/docs/whoop-101/)
- [2026 What's New](https://www.whoop.com/us/en/thelocker/2026-whats-new/)
- [Everything launched in 2025](https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/)
- [Introducing WHOOP 5.0 and MG](https://www.whoop.com/us/en/thelocker/introducing-whoop-5-0-and-whoop-mg/)
- [Heart Rate Broadcast](https://support.whoop.com/s/article/Heart-Rate-Broadcast)
- [How recovery is calculated](https://support.whoop.com/hc/en-us/articles/360019453654-How-is-Recovery-calculated-)
- [Sleep accuracy](https://www.whoop.com/us/en/thelocker/how-well-whoop-measures-sleep/)
- [Strain explained](https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/)
- [Skin temperature](https://www.whoop.com/us/en/thelocker/how-whoop-tracks-skin-temperature/)
- [Activity Auto-Detection](https://www.whoop.com/us/en/thelocker/activity-auto-detection-knows-you-work-out/)
- [Stress Monitor](https://www.whoop.com/us/en/thelocker/introducing-stress-monitor-a-new-way-to-monitor-manage-stress/)
- [WHOOP Journal](https://www.whoop.com/us/en/thelocker/the-whoop-journal/)
- [Press: 5.0 and MG unveil](https://www.whoop.com/us/en/press-center/whoop-unveils-5.0-MG/)

### Forensic / technical analyses
- [Istanbul2023: Forensic analysis of WHOOP](https://www.istanbul2023.org/forensic-analysis-of-the-whoop/)
- [smarthome724: Forensic analysis WHOOP 4.0](https://www.smarthome724.com/post/detail/387/)
- [the5krunner: WHOOP 4.0 vs 5.0 sensor architecture](https://the5krunner.com/2025/06/16/whoop-4-0-vs-whoop-5-0-sensor-architecture-changes-detailed-technical-content/)
- [the5krunner: WHOOP 2026 review](https://the5krunner.com/2025/10/31/2026-whoop-5-0-mg-review-discount-accuracy-strain-recovery-athletes/)
- [the5krunner: Strength Trainer Passive MSK](https://the5krunner.com/2026/02/28/new-whoop-strength-trainer-update/)
- [Nordic press: WHOOP 4 uses nRF52840](https://www.nordicsemi.com/Nordic-news/2022/07/The-WHOOP-4-uses-Nordics-nRF52840-SoC)

### Hacker News / community
- [HN: Reverse Engineering Whoop 4.0](https://news.ycombinator.com/item?id=41723890)
- [HN: Whoop 5 and Whoop MG](https://news.ycombinator.com/item?id=43925301)
- [@jogold32 tweet](https://x.com/jogold32/status/1875993250798182423)
- [johnfitz.me/projects](https://johnfitz.me/projects/)
- [r/whoop stats](https://subredditstats.com/r/whoop)

### Legal / regulatory
- [FDA warning letter to WHOOP, July 14 2025](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025)
- [the5krunner: WHOOP sues Bevel](https://the5krunner.com/2026/04/04/whoop-sues-bevel/)
- [WearableXP: WHOOP v Bevel explained](https://wearablexp.com/news/whoop-vs-bevel-lawsuit-explained/)
- [TechRadar: I tried the app WHOOP just sued](https://www.techradar.com/health-fitness/fitness-apps/i-tried-the-app-whoop-just-sued-and-itd-be-a-real-shame-if-it-lost-the-battle)
- [Leppard Law: DMCA RE](https://leppardlaw.com/federal/computer-crimes/evaluating-the-role-of-reverse-engineering-in-dmca-compliance-under-us-federal-law/)
- [EFF: 15 years under the DMCA](https://www.eff.org/pages/unintended-consequences-fifteen-years-under-dmca)
- [HackerOne: WHOOP bug bounty](https://hackerone.com/whoop_bug_bounty?type=team)
- [Bloomberg: WHOOP 5.0 MG ECG/BP review](https://www.bloomberg.com/news/features/2025-05-08/review-whoop-5-0-whoop-mg-add-ecg-blood-pressure-subscription-from-199)

### Academic / scientific
- [Validation study of WHOOP vs PSG (PubMed)](https://pubmed.ncbi.nlm.nih.gov/32713257/)
- [PMC: 6 wrist-worn wearable sleep-staging validation](https://pmc.ncbi.nlm.nih.gov/articles/PMC12038347/)
- [PMC: Wrist PPG HR/HRV validation of WHOOP](https://pmc.ncbi.nlm.nih.gov/articles/PMC8160717/)
- [MDPI: Frequent WHOOP wear and biometrics](https://www.mdpi.com/1424-8220/25/8/2437)
