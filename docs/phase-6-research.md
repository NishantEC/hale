# Phase 6 Research — Deferred Items Deep Dive

**Compiled:** May 2026
**Scope:** Three deferred research items from the community survey (`whoop-community-research.md`): firmware/OTA path, pairing/virgin-mode provisioning, WHOOP 5.0 / MG protocol. Plus bonus topics on dual-MCU architecture, Memfault, and the WHOOP Body / new app stack. Every assertion is cited; goal is 20+ distinct sources across the three primary topics.

---

## 0. TL;DR

| Topic | Public progress | Hardest blocker | Realistic feasibility for us |
|---|---|---|---|
| Firmware OTA upload (cmd 36-38, 45, 142-144) | None — no public repo implements writes; only OpenWhoop downloads the blob from the *cloud* API | Likely a signed image + dual-bank swap on a chip we don't have JTAG to. We don't even know if Whoop ships HMAC over the BLE write path. | **Open research problem.** Read-only "version + image hash sniff" is doable; pushing an image is not, and is also a great way to brick units. |
| First-time pairing / virgin-mode exit | None public. Every project hijacks an already-bonded device. `EventNumber.ExitVirginMode = 31` documented as observable, but the entry side (commands the app sends during onboarding) is undocumented. | Almost certainly a one-shot crypto handshake bound to the unit's serial + a cloud-issued blob. The official app calls Whoop's account service before talking BLE. | **Partially doable, blocked by app-side onboarding semantics.** Tractable with a `whoop-simulator`-style honeypot + JADX trace of the onboarding screen path. 4–8 weeks. |
| WHOOP 5.0 / MG protocol | Effectively zero. `openwhoop` has an open issue (#24, May 2026) where a contributor offered hardware but received no maintainer response. No public BLE captures published. | We don't have a 5.0/MG unit; the GATT layout *probably* changed because the SoC vendor changed (Nordic nRF52840 → Ambiq Apollo*) and the FCC schematics for the new PCBs (820-000100, 820-000188) are filed confidentially. | **Partially doable** once we buy one device. Custom GATT discovery, framing diff, CRC verification is a 1-week effort if 4.0 protocol mostly carried over. |

Full reasoning, sources, and recommended approach per topic below.

---

## 1. Firmware update / OTA path

### 1.1 Official mechanism (what the user-visible flow looks like)

Whoop's own support documentation confirms two-firmware (dual-MCU) architecture on the strap:

> "There are two programs on the Strap that may receive firmware updates: the Bluetooth Firmware and the Strap Firmware."

Source: [WHOOP Support — How to Update Your Product's Firmware](https://support.whoop.com/s/article/WHOOP-3-0-and-4-0-How-to-Update-Your-Product-s-Firmware) and the search snippet of [How To Update your Strap's Firmware](https://support.whoop.com/hc/en-us/articles/360042528574-How-To-Update-your-Strap-s-Firmware).

Update is initiated only from the WHOOP app, only over BLE, and takes ~10 minutes. The strap must stay within 10 feet of the phone the whole time; ≥20% battery is required. Source: same support page as above; community thread [How do I update the firmware on my WHOOP strap?](https://www.community.whoop.com/t/how-do-i-update-the-firmware-on-my-whoop-strap/244).

User-facing version strings on WHOOP 5.0/MG are dotted quads such as `50.34.0.6`, `50.35.2.0`, `50.36.1.0` — i.e. `<gen>.<major>.<minor>.<patch>`. Community threads: [Firmware update 50.35.2.0](https://www.community.whoop.com/t/firmware-update-50-35-2-0-any-details/10969), [New firmware 50.36.1.0](https://www.community.whoop.com/t/new-firmware-50-36-1-0/13928). No public-facing version naming uses the `Harvard` / `Boylston` codenames (see §4.1 below).

The battery pack on WHOOP 4.0 has its *own* firmware, updated over USB-C using a desktop app ("Whoop Battery Pack Updater") rather than BLE. Source: [Gadgets & Wearables — Your Whoop battery pack might need a firmware update (Jan 2025)](https://gadgetsandwearables.com/2025/01/28/whoop-battery-pack-firmware/). The only public RE of the pack's USB protocol is [nekkid-yoga/Whoop4.0BatteryReset](https://github.com/nekkid-yoga/Whoop4.0BatteryReset), which decoded a single "reset bricked pack" command and otherwise didn't characterise the firmware-write path.

### 1.2 What's documented at the protocol layer

Our local `whoop-ble-protocol-reference.md` enumerates the seven firmware-related command IDs from JADX-decompiled app strings:
- `36 = StartFirmwareLoadOld`
- `37 = LoadFirmwareDataOld`
- `38 = ProcessFirmwareImageOld`
- `45 = SwapBank`
- `142 = StartFirmwareLoadNew`
- `143 = LoadFirmwareDataNew`
- `144 = ProcessFirmwareImageNew`

The `Old` / `New` split implies a protocol-version migration on the strap side at some point in 2023-2024. `SwapBank` plus the start/load/process triplet is the textbook *MCUboot* / Nordic *Secure DFU* dual-bank pattern: stream the new image into the inactive bank, swap the boot pointer, reset. Sources: [Adafruit nRF52 Bootloader DUAL_BANK config](https://github.com/adafruit/Adafruit_nRF52_Bootloader), [Nordic nRF5 SDK Secure Boot](https://infocenter.nordicsemi.com/topic/sdk_nrf5_v16.0.0/lib_secure_boot.html). MCUboot is the more modern variant Nordic now recommends with NCS: [Performing Device Firmware Upgrade in nRF Connect SDK](https://developer.nordicsemi.com/nRF_Connect_SDK/doc/2.0.0/matter/nrfconnect_examples_software_update.html), [Nordic DevZone — DFU via OTA using BLE](https://devzone.nordicsemi.com/f/nordic-q-a/96939/ncs-v2-2-0---device-firmware-update-dfu-via-ota-using-ble).

### 1.3 Public implementations: only the download side

| Project | What's implemented | Source |
|---|---|---|
| `bWanShiTong/openwhoop` (Rust) | `download-firmware` command. Requires `WHOOP_EMAIL` / `WHOOP_PASSWORD`. Hits Whoop's *cloud* API (not the strap) to fetch the signed binary blob the official app would push. No write path. | [README](https://github.com/bWanShiTong/openwhoop) |
| `jogolden/whoomp` | None. README explicitly TODO: *"document firmware, update format, extraction, analysis of binaries, hardware schematic, battery pack updater, etc."* | [GitHub](https://github.com/jogolden/whoomp) |
| `bWanShiTong/reverse-engineering-whoop-post` | None. Documents only the read/sync side. | [GitHub](https://github.com/bWanShiTong/reverse-engineering-whoop-post) |
| `christianmeurer/whoop-reader` | None (live-stream only). | [GitHub](https://github.com/christianmeurer/whoop-reader) |
| `nekkid-yoga/Whoop4.0BatteryReset` | USB reset on the *charger*, not BLE. | [GitHub](https://github.com/nekkid-yoga/Whoop4.0BatteryReset) |

OpenWhoop's `download-firmware` is the most interesting deferred capability: it confirms the binary is delivered as a signed cloud payload that the *app* then re-streams over BLE. So even if you decode the BLE write protocol, you still need the cloud-signed image (or a way to mint one) to do anything useful with it.

### 1.4 Are there custom firmware images for WHOOP 4.0?

No, as of May 2026 — and the community has not even *extracted* a clean firmware image publicly. jogolden's README claims his methodology was "reverse engineer Android app, get latest firmware, extract firmware, analyze firmware, rebuild everything in python using bleak", but the repository contains zero artifacts of that firmware analysis. Reference: [GitHub - jogolden/whoomp](https://github.com/jogolden/whoomp), [johnfitz.me/projects](https://johnfitz.me/projects/).

The general technique for stealing a wearable's firmware from the OTA update payload is documented in [Security Innovation — Stealing Firmware from Over-The-Air Updates](https://blog.securityinnovation.com/stealing-firmware-from-over-the-air-updates). Steps: (1) MITM the app's HTTPS to Whoop's CDN by installing your own root CA in the user-CA store on a rooted Android (Whoop's app likely pins certs, so this is non-trivial in 2026); (2) dump the binary blob the app would push over BLE; (3) feed it to `binwalk` / `ghidra` ([Firmware RE with Binwalk and Ghidra](https://stevenfoerster.com/tutorials/firmware-extraction-and-reverse-engineering-with-binwalk-and-ghidra/), [ReFirmLabs/binwalk](https://github.com/ReFirmLabs/binwalk)). None of this is published as a tutorial against Whoop specifically.

### 1.5 OTA tools targeting Whoop?

None. The closest community tooling is `thegecko/web-bluetooth-dfu` ([GitHub](https://github.com/thegecko/web-bluetooth-dfu)) — a generic Web Bluetooth DFU client for Nordic Secure DFU — but it talks to Nordic's reference Secure DFU service UUIDs, *not* Whoop's custom 6108xxxx service. So it's not directly usable; it'd at most be a structural reference.

### 1.6 Why is no one pushing on this?

Three reasons converge:
1. **Brick risk.** A miswritten image to the BT MCU bricks the unit entirely (no USB recovery path, the only physical connector is the proprietary charger pogo pins, see [FCC ID 2AJ2X-WS40 (WHOOP 4.0)](https://fcc.report/company/Whoop-Inc) and [FCC ID 2AJ2X-WB50](https://fccid.io/2AJ2X-WB50)). At $239+ a unit, the experimental cost is real.
2. **Signed images, almost certainly.** Whoop's straps are NSA-approved for SCIF use (no mic, no GPS, no cellular) per [WHOOP Government & Defense page](https://www.whoop.com/us/en/tactical/). That clearance practically requires signed firmware. There's no public confirmation of the signing scheme — but the Nordic nRF52840 (4.0) and Ambiq Apollo* (5.0) families both ship with secure boot extensions, and Whoop's procurement pattern (clinical-grade AFE, ARM TrustZone-capable MCUs) makes unsigned firmware unlikely.
3. **No upside for an open client.** A read-only "is the firmware version safe to interop with" check is all most projects need. Actually rolling back / replacing firmware is far outside any user's normal use case.

### 1.7 Conference talks?

A site-specific search of `defcon.org`, `recon.cx`, `blackhat.com`, `derbycon.com` for "WHOOP" returned nothing as of May 2026 (consistent with the previous community survey's negative finding). Adjacent prior art on wearable firmware extraction does exist:
- [Securelist — How I hacked my smart bracelet (Roman Unuchek, Kaspersky)](https://securelist.com/how-i-hacked-my-smart-bracelet/69369/) — Xiaomi Mi Band, 2015. Solid template for the methodology but predates SE bonding.
- [BreakMi: Reversing, Exploiting and Fixing Xiaomi Fitness Ecosystem (CHES 2022)](https://hexhive.epfl.ch/publications/files/22CHES.pdf) — full reverse of Mi Band + Amazfit, including pairing/auth bypass. The *closest* applicable academic work to what we'd want for Whoop.
- [Newer, the More Secure? Standards-Compliant BLE MITM on Fitness Trackers (Sensors, 2025)](https://www.mdpi.com/1424-8220/25/6/1815) / [PMC mirror](https://pmc.ncbi.nlm.nih.gov/articles/PMC11945526/) — eight Polar/Garmin/Xiaomi devices, four BLE MITM attacks. Whoop is *not* in the test set.

---

## 2. Pairing flow / virgin-mode provisioning

### 2.1 What's known

Whoop straps ship in a "virgin" state. The user's only path to provision is the official Whoop app over BLE, after creating a Whoop account, after which the strap exits virgin mode (the event our protocol reference lists as `EventNumber.ExitVirginMode = 31`). Source: [WHOOP Support — Setting Up Your WHOOP](https://support.whoop.com/s/article/Setting-Up-Your-WHOOP-4-0), [WHOOP Support — WHOOP Sensor Pairing Guide](https://support.whoop.com/s/article/WHOOP-4-0-iOS-Connectivity-and-Pairing?language=en_US).

To enter "pairing mode" physically: take the strap off, wait 15 s for the green LEDs to switch off, then double-tap firmly on the top centre until the blue LED pulses. Source: [WHOOP Support — Putting the WHOOP Strap into Pairing Mode](https://support.whoop.com/hc/en-us/articles/360038582374-Putting-the-WHOOP-Strap-into-Pairing-Mode). This is the only *user-visible* state machine; under the hood there's clearly more.

WHOOP also says explicitly that pairing **must** happen inside the app; pairing through the phone's BT settings causes the strap to "not appear in the app or [lead] to other errors": [WHOOP Support — WHOOP 3.0 Android Connectivity and Pairing](https://support.whoop.com/hc/en-us/articles/360025115374-WHOOP-Strap-3-0-Android-Connectivity-and-Pairing). The 3.0 BLE Tips & Tricks article confirms this OS-level constraint: [WHOOP Strap 3.0 Bluetooth Low Energy Tips and Tricks](https://www.whoop.com/us/en/thelocker/whoop-strap-3-0-bluetooth-low-energy-tips-and-tricks/).

### 2.2 What's NOT known

The actual handshake. None of the public projects has decoded:
- Whether the strap participates in **LE Secure Connections** (BT 4.2+, ECDH-based) or **LE Legacy Pairing** (vulnerable to `crackle`).
- The series of commands the app issues during the onboarding flow ("which user owns this serial", "burn baseline calibration", etc.).
- How the strap binds itself to a Whoop account ID. (Empirically, you can't pair a strap to two accounts — Whoop blocks that. So there's *server-side* state too.)
- What `ExitVirginMode` actually does on the strap (sets a flash flag? installs an LTK from the app? both?).

`bWanShiTong/whoop-simulator` ([GitHub](https://github.com/bWanShiTong/whoop-simulator), Rust, experimental) is the only project even attempting this — it impersonates a strap so the official app sends *its* onboarding commands at a researcher-controlled GATT server. It's incomplete (no captures published).

### 2.3 Crackle / passive-sniff feasibility

If the strap pairs with Just-Works (no IO capability, common for screenless wearables), then with one [Ubertooth One](https://github.com/mikeryan/crackle) or an [nRF Sniffer + Wireshark](https://learn.adafruit.com/ble-sniffer-with-nrf52840/working-with-wireshark) you can capture the pairing exchange and feed it to `crackle`:

> "Crackle can crack Legacy pairing keys in approximately one second through passive monitoring." Source: [GitHub — mikeryan/crackle FAQ](https://github.com/mikeryan/crackle/blob/master/FAQ.md), [Darknet — crackle](https://www.darknet.org.uk/2017/02/crackle-crack-bluetooth-smart-encryption-ble/).

But if Whoop uses **LE Secure Connections** (the post-4.2 ECDH variant), passive sniffing yields nothing useful — only an active MITM with the [Fixed-Coordinate Invalid Curve Attack](https://crypto.iacr.org/2019/affevents/wac/medias/Neumann-BreakingBluetoothPairing.pdf) gives the attacker a 25–50% chance of recovering the DHKey. Source: [How Does Bluetooth LE Secure Pairing Work?](https://www.freecodecamp.org/news/how-does-bluetooth-le-secure-pairing-work/), [Nordic Developer Academy — Legacy vs LE Secure Connections](https://academy.nordicsemi.com/courses/bluetooth-low-energy-fundamentals/lessons/lesson-5-bluetooth-le-security-fundamentals/topic/legacy-pairing-vs-le-secure-connections/).

A purely passive-sniff approach is anyway moot for a bonded device that's reconnecting — once the LTK is on disk in the phone's BT stack, the pairing key exchange never happens again, so there's nothing to crack. You'd need to capture the *very first* pair against a brand-new account: [Bsniffhub README](https://github.com/homewsn/bsniffhub).

The more productive technique on iOS is to dump the bonding key directly from PacketLogger after the app pairs: [Novel Bits — Debugging Bluetooth LE on iOS: HCI Capture & LTK Extraction](https://novelbits.io/debugging-sniffing-secure-ble-ios/). On Android, the equivalent is the HCI snoop log: [Android docs — Verify and debug Bluetooth](https://source.android.com/docs/core/connect/bluetooth/verifying_debugging), [Medium — Decoding Bluetooth HCI logs](https://medium.com/@basanta.behera/decoding-bluetooth-on-your-android-phone-understanding-and-analyzing-your-hci-log-2af36e221695).

### 2.4 The "real" problem isn't BLE crypto — it's the app↔server handshake

Even with the LTK in hand and the GATT exchange fully decrypted, the *application-layer* onboarding flow uses Whoop's account-creation REST API to issue device-binding tokens. `jjur/whoop-sleep-HR-data-api` is the only public project to even touch the internal API (`app.whoop.com`, not the developer-facing `api.prod.whoop.com`): [GitHub — jjur/whoop-sleep-HR-data-api](https://github.com/jjur/whoop-sleep-HR-data-api). It does only OAuth-emulated reads, not device binding.

`jacc/whoop-re` documents internal endpoints (`coaching-service`, journals, sports history) but explicitly notes "bearer tokens are required for all requests and expire after 24 hours, which can be obtained using Charles or another SSL sniffing tool": [GitHub — jacc/whoop-re](https://github.com/jacc/whoop-re). Same approach (SSL-pinning bypass on Android + Charles/mitmproxy) would let you observe the device-pair API calls. Nobody has published this.

### 2.5 Recent activity?

- `bWanShiTong/openwhoop` open issue #22 ("Android / IOS integration", Apr 2026, by 0x090909) — implies a wrapping Tauri app, *not* a virgin-pair flow.
- `bWanShiTong/openwhoop` issue #24 ("Whoop 5.0 test", May 2026, by davidtalas) — contributor with a spare WHOOP 5.0; no maintainer reply yet.
- `jogolden/whoomp` issue #7 ("Feature request: Local data capture & visualization iOS app for expired Whoop devices", May 2025, by ma-2a) — *the* user-segment we'd serve, but no code.

No Reddit thread on r/whoop or HN as of May 2026 references a successful first-time pair without the app.

### 2.6 Bug-bounty pressure?

WHOOP runs a HackerOne program for the *cloud/app* side: [hackerone.com/whoop_bug_bounty](https://hackerone.com/whoop_bug_bounty?type=team). Touching the device for interop is out of scope; touching their account-creation API to defeat virgin-mode binding is decidedly *in* scope. So any researcher who solved this would also be sitting on a bounty payout if they wanted to play it that way.

---

## 3. WHOOP 5.0 / MG protocol decoding

### 3.1 What launched in 2025

- **WHOOP 5.0** (model `WS50`, FCC ID `2AJ2X-WS50`, granted May 8 2025): 7% smaller, 60% faster processor, 26 Hz PPG sampling, 14-day battery, "sensors 10× less power". Sources: [WHOOP — Introducing 5.0 and MG](https://www.whoop.com/us/en/thelocker/introducing-whoop-5-0-and-whoop-mg/), [the5krunner — sensor architecture changes](https://the5krunner.com/2025/06/16/whoop-4-0-vs-whoop-5-0-sensor-architecture-changes-detailed-technical-content/), [BusinessWire press release](https://www.businesswire.com/news/home/20250508546933/en/WHOOP-Unveils-WHOOP-5.0-and-WHOOP-MG-Powerful-New-Devices-with-Breakthrough-Health-and-Longevity-Features).
- **WHOOP MG** (model `WG50`, FCC ID `2AJ2X-WG50`): same form factor as 5.0, plus single-lead ECG via clasp contact pads, plus the (FDA-warned) Blood Pressure Insights. Sources: [FDA 510(k) K243236 — WHOOP ECG Feature](https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K243236), [Innolitics summary of K243236](https://fda.innolitics.com/submissions/CV/subpart-c%E2%80%94cardiovascular-monitoring-devices/QDA/K243236).
- **WHOOP WD50 / WB50** charger and battery pack (filed concurrently May 5–8 2025, FCC IDs `2AJ2X-WD50`, `2AJ2X-WB50`). 13.56 MHz NFC + 2.4 GHz BLE. The new "AnyWear"-friendly wireless charger replaces the 4.0 clip. Source: [fcc.report — Whoop Inc. filings](https://fcc.report/company/Whoop-Inc).

The full FCC filing slate for May 2025 thus comprises four NEW DEVICE submissions: WS50, WG50, WD50, WB50 ([fcc.report](https://fcc.report/company/Whoop-Inc)). Public exhibits include external photos, BLE test reports, antenna specs, user manuals; **schematics and block diagrams are filed confidentially** (e.g. `confidential_4]WS50_Schematic_820-000100`, `confidential_6]WG50-BlockDiagram`) per [fcc.report/FCC-ID/2AJ2X-WS50/](https://fcc.report/FCC-ID/2AJ2X-WS50/) and [fcc.report/FCC-ID/2AJ2X-WG50/](https://fcc.report/FCC-ID/2AJ2X-WG50/). Confidentiality on internal photos was scheduled to lift Nov 1 2025, meaning they should now be public — but TechInsights and Electronics360 each gated their teardown behind paywalls ([TechInsights teardown](https://www.techinsights.com/blog/whoop-50-wg50-deep-dive-teardown), [Electronics360](https://electronics360.globalspec.com/article/23159/techinsights-teardown-whoop-5-0)).

### 3.2 Confirmed hardware changes (5.0 vs 4.0)

| Component | WHOOP 4.0 | WHOOP 5.0 | Source |
|---|---|---|---|
| MCU / radio | Nordic nRF52840 (Cortex-M4 64 MHz, BLE 5.0) | **Ambiq Apollo*** Cortex-M4 + BLE 5.0 (specific Apollo variant not disclosed publicly) | [Nordic press (4.0)](https://www.nordicsemi.com/Nordic-news/2022/07/The-WHOOP-4-uses-Nordics-nRF52840-SoC), [Electronics360 teardown summary](https://electronics360.globalspec.com/article/23159/techinsights-teardown-whoop-5-0) |
| PPG/ECG AFE | Maxim MAX86171 (PPG only) | Analog Devices clinical-grade PPG/ECG AFE — likely **MAX86178** (PPG+ECG+BioZ in one package) given the ECG capability on MG. Confirmed AFE generation change in teardown summary; exact part not named publicly. | [the5krunner sensor changes](https://the5krunner.com/2025/06/16/whoop-4-0-vs-whoop-5-0-sensor-architecture-changes-detailed-technical-content/), [MAX86178 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max86178.pdf), [ADI press: clinical-grade AFE](https://www.prnewswire.com/news-releases/clinical-grade-afe-from-analog-devices-measures-four-vital-signs-for-remote-patient-monitoring-devices-301379832.html) |
| IMU | 6-axis (accel + gyro, vendor not publicly identified in 4.0) | **TDK InvenSense 6-axis MEMS** (likely ICM-456xy or ICM-42688-P class) | [Electronics360 teardown](https://electronics360.globalspec.com/article/23159/techinsights-teardown-whoop-5-0), [TDK ICM-42688-P datasheet](https://product.tdk.com/system/files/dam/doc/product/sensor/mortion-inertial/imu/data_sheet/ds-000347-icm-42688-p-v1.6.pdf) |
| Sensor PCB | (4.0 sensor PCB code not public) | **820-000100** (5.0), **820-000188** (MG, adds ECG circuitry) | FCC schematic filenames in [WS50](https://fccid.io/2AJ2X-WS50) / [WG50](https://fccid.io/2AJ2X-WG50) filings |
| Charger | Magnetic clip pack | Wireless via 13.56 MHz NFC inductive coupling | [FCC WD50](https://fccid.io/2AJ2X-WD50), [FCC WB50](https://fccid.io/2AJ2X-WB50) |
| BLE TX power | — | 2.58 mW (WS50), 6.37 mW (WB50 battery pack) | [WS50 BLE report](https://fccid.io/2AJ2X-WS50), [WB50 BLE report](https://fccid.io/2AJ2X-WB50) |

The MCU vendor change (Nordic → Ambiq) is the single most consequential RE implication. Ambiq's Apollo family ([ambiq.com/soc](https://ambiq.com/soc/), [Apollo4 Blue Lite datasheet](https://www.mouser.com/datasheet/2/1494/Apollo4_Blue_Lite_Datasheet-3317499.pdf), [Apollo4 Blue product page](https://ambiq.com/product/apollo4-blue/)) uses a *different* BLE controller stack ("blueSPOT" / "turboSPOT" — [Ambiq blueSPOT](https://ambiq.com/technology/bluespot/)), which means: even if the GATT layout is preserved byte-for-byte, link-layer behaviour (MTU defaults, connection parameters, BLE 5.x feature support like 2M PHY) will differ. The bWanShiTong/openwhoop README (Rust) currently assumes Nordic-style link parameters; tested against 5.0, this almost certainly needs adjustment.

The 5.0 datasheet from Ambiq's family that fits the profile best is the **Apollo4 Blue Plus** (192 MHz, BLE 5.1, HexSPI flash, dedicated BLE core) — [Apollo4 Blue Plus SoC Datasheet](https://ambiq.com/wp-content/uploads/2022/06/Apollo4-Blue-Plus-SoC-Datasheet.pdf), [Mouser product page](https://eu.mouser.com/new/ambiq/ambiq-apollo3-blue-plus-soc/). This is consistent with the "60% faster processor" claim. Important: Apollo4 family has a **dedicated second core for BLE 5 connectivity** ([Ambiq Apollo3 Blue page](https://ambiq.com/apollo3-blue/)), which natively explains a dual-firmware architecture (one image per core).

### 3.3 What public code says about 5.0

Effectively nothing yet:

- `bWanShiTong/openwhoop` issue #24 (May 7 2026): open. davidtalas offered hardware and Claude Max access; no maintainer response. [Issue #24](https://github.com/bWanShiTong/openwhoop/issues/24).
- OpenWhoop's README TODO mentions "Testout Whoop 5.0".
- `jogolden/whoomp` has no 5.0 issues, comments, or commits.
- `christianmeurer/whoop-reader` explicitly scoped to "Whoop 4.0 fitness band" with no 5.0 work.
- `topics/whoop` GitHub topic ([github.com/topics/whoop](https://github.com/topics/whoop)) lists 54 repos as of May 2026; spot-checking the most recently updated (delx-wellness, intervals-icu-mcp, whoop-data April 2026) — all are cloud-API consumers, none touch BLE 5.0.

### 3.4 Are FDA/regulatory filings useful for RE?

Limited but non-zero:

- The K243236 510(k) decision letter ([accessdata.fda.gov K243236](https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K243236)) classifies the ECG feature as "WHOOP ECG Feature, software-only mobile medical application … qualitatively similar to a Lead I ECG", with AFib / sinus / brady / tachy classification. Predicate device is presumably Apple Watch's ECG (the standard predicate for wrist ECGs). This tells us **the ECG output is a single-channel waveform**, not just a beat label, which means there's a fairly fat data path between the strap and the phone during an ECG capture — probably a separate GATT characteristic or a re-purposed `DATA_FROM_STRAP`. [JMIR — WHOOP, There It Is: Lessons From WHOOP's FDA Warning Letter (2026)](https://www.jmir.org/2026/1/e90882) walks through the regulatory framing in detail.
- The FDA warning letter ([fda.gov — WHOOP Inc 709755](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025), dated July 14 2025, summarised by [The FDA Group](https://insider.thefdagroup.com/p/fda-warning-letter-breakdown-whoop), [CNBC](https://www.cnbc.com/2025/07/15/whoop-fda-blood-pressure-feature-wearables.html), [MobiHealthNews](https://cloudgate.mobihealthnews.com/news/whoop-pushes-back-fda-over-blood-pressure-feature), [MD+DI](https://www.mddionline.com/wearable-medical-devices/to-be-or-not-to-be-a-medical-device-fda-vs-whoop)) tells us BP is derived from PAT/PPG without a separate sensor. So Blood Pressure Insights uses the same data path as HR — no new BLE characteristic needed. The MG hardware difference for BP is essentially zero; it's an enabled-by-firmware feature gate on top of WHOOP 5.0 sensor PCB plus a personal calibration model.

### 3.5 Pieces still genuinely unknown

| Unknown | Why it matters | Approach |
|---|---|---|
| GATT service UUID on 5.0 (still `61080000-...`?) | If changed, every existing client breaks on connect. | `bluetoothctl` / `nRF Connect` scan + service discovery |
| Framing / CRC on 5.0 (still `aa 10 00 57 23`, still `0xF43F44AC` XOR-out?) | Determines whether 4.0 parsers compile against 5.0 captures | HCI snoop, diff against 4.0 known plaintext |
| ECG GATT characteristic | New attribute or re-use of `DATA_FROM_STRAP`? | Capture during an ECG reading session |
| BP calibration command | What does the app push to the strap during the 14-day BP calibration window? | App-side JADX + BLE capture during calibration |
| New event IDs (battery telemetry diffs, etc.) | The 5.0 has dramatically different battery telemetry due to the bigger pack and wireless charging | Long-running capture across charge cycles |

---

## 4. Bonus topics

### 4.1 "Harvard X.X.X.X / Boylston X.X.X.X" dual-firmware naming

Our protocol reference notes that WHOOP firmware reports two version pairs, one per MCU, labelled `Harvard` and `Boylston`. Public sources don't surface these names — every external version mention uses the dotted-quad form like `50.35.2.0`. The names are clearly internal codenames for the two firmware images, and both are Boston neighbourhood references consistent with Whoop's company HQ at One Kenmore Square / 1325 Boylston St ([WHOOP HQ unveiling at Kenmore Square, July 2023](https://www.e-architect.com/america/whoop-headquarters-in-boston-massachusetts), [WHOOP Boston office listing — Built In Boston](https://www.builtinboston.com/company/whoop), [WHOOP Boston Office on Glassdoor](https://www.glassdoor.com/Location/WHOOP-Boston-Location-EI_IE983091.0,5_IL.6,12_IC1154532.htm)).

**Plausible mapping** (uncited inference; needs confirmation in a JADX trace of the official app):
- `Harvard` = application MCU firmware (the "Strap Firmware" per Whoop's support docs)
- `Boylston` = BLE/radio MCU firmware (the "Bluetooth Firmware")

This split is the standard Ambiq Apollo4 Blue pattern: app-core firmware ("Harvard" = host?) + BLE-core firmware on the dedicated second BLE core ("Boylston" = link controller?). It's also consistent with Whoop's own taxonomy of "two programs on the Strap" ([WHOOP Support — Update Your Product's Firmware](https://support.whoop.com/s/article/WHOOP-3-0-and-4-0-How-to-Update-Your-Product-s-Firmware)).

Has anyone disassembled the firmware images? **No.** Zero public Ghidra / IDA projects target Whoop firmware. The download path is documented (OpenWhoop's `download-firmware` cloud call), but no extracted blob has been published, no disassembly has been published. If/when published, the right tooling is [binwalk](https://github.com/ReFirmLabs/binwalk) → [Ghidra](https://stevenfoerster.com/tutorials/firmware-extraction-and-reverse-engineering-with-binwalk-and-ghidra/) → ARM Cortex-M4 disassembly with the Ambiq Apollo memory map ([Apollo4 SoC Datasheet](https://contentportal.ambiq.com/documents/20123/388400/Apollo4-SoC-Datasheet.pdf)).

### 4.2 Memfault

Our protocol reference notes characteristic `61080007-...` is labelled `MEMFAULT` (handle `0x001b`, notify). This is the BLE transport for Memfault's chunks protocol.

**The format is publicly documented enough to decode.**

Memfault's chunks protocol on the firmware side:
- All data values are encoded using **CBOR** (Concise Binary Object Representation). [Memfault Docs — Event Serialization Overview](https://docs.memfault.com/docs/mcu/event-serialization-overview).
- The SDK packetizes data (coredumps, events, heartbeats) into **chunks** sized to the BLE MTU (typically ~20 bytes for default 23-byte MTU; can scale up with negotiated MTU). [Memfault Docs — Data from Firmware to the Cloud](https://docs.memfault.com/docs/mcu/data-from-firmware-to-the-cloud).
- Chunks must be posted **sequentially in order** to the chunks HTTP endpoint. Reassembly happens server-side. [Memfault Docs — Post Chunks with Memfault CLI](https://docs.memfault.com/docs/mcu/export-chunks-over-console).
- Standard export form (when no live connection): `MC:BASE64_ENCODED_CHUNK:` strings emitted on a console. [Memfault Docs — Test data collection with GDB](https://docs.memfault.com/docs/mcu/test-data-collection-with-gdb).

Coredump on-device format (binary, *not* CBOR):
- Magic `0x45524F43` ("CORE"), version `1`. [memfault_gdb.py in memfault-firmware-sdk](https://github.com/memfault/memfault-firmware-sdk/blob/master/scripts/memfault_gdb.py).
- File header: `<III` (LE: magic, version, total length).
- Block header: `<bxxxII` (1 byte type + 3 pad + 4 byte addr + 4 byte payload length), followed by payload bytes.
- Block types include: `CURRENT_REGISTERS`, `MEMORY_REGION`, `DEVICE_SERIAL`, `FIRMWARE_VERSION`, `HARDWARE_REVISION`, `TRACE_REASON`, `MACHINE_TYPE`, `ARM_V7M_MPU`, etc. [coredump.h in memfault-firmware-sdk](https://github.com/memfault/memfault-firmware-sdk/blob/master/components/include/memfault/panics/coredump.h), [platform/coredump.h](https://github.com/memfault/memfault-firmware-sdk/blob/master/components/include/memfault/panics/platform/coredump.h).
- Coredump regions of type `kMfltCoredumpRegionType_{Memory, MemoryWordAccessOnly, ImageIdentifier, ArmV6orV7MpuUnrolled, CachedMemory}`. Same headers as above.
- Upload is `application/octet-stream` to Memfault's ingress.
- Memfault provides a Coredump→ELF download in the dashboard ([Memfault Docs — Debugging MCU coredumps with GDB](https://docs.memfault.com/docs/mcu/coredump-elf-with-gdb)) so a coredump can be loaded into GDB with `gdb --se symbols.elf --core coredump.elf`.

**The catch**: events (the high-volume payload, what Whoop is most likely to be sending in steady state) are encoded as **ordered CBOR arrays *without* field-name metadata**. The decode requires the firmware-specific symbol file:

> "The Memfault cloud makes use of the symbol file for the firmware release to autogenerate a mapping back to the key names." — [Memfault Docs — Event Serialization Overview](https://docs.memfault.com/docs/mcu/event-serialization-overview).

So: we can absolutely *capture* and *frame* Memfault chunks off the `61080007` characteristic without proprietary tooling, base64-encode them as `MC:...:` strings, and even post them to a Memfault project of our own to get human-readable events back. But to interpret the field names without a Memfault account, we'd need Whoop's symbol files (not public). The Memfault SDK and tooling are MIT/Apache-licensed and open source ([memfault-firmware-sdk](https://github.com/memfault/memfault-firmware-sdk), [Releases](https://github.com/memfault/memfault-firmware-sdk/releases), [CHANGELOG](https://github.com/memfault/memfault-firmware-sdk/blob/master/CHANGELOG.md)) so building a chunk decoder is straightforward.

A useful general-purpose comparison: [Interrupt — Linux Coredumps Part 1](https://interrupt.memfault.com/blog/linux-coredumps-part-1) and [Memfault Embedded Artistry interview](https://embeddedartistry.com/blog/2021/01/18/is-memfault-the-future-of-fault-debugging-we-think-so/) for context on how the wider firmware-observability industry uses these formats.

### 4.3 WHOOP Body / "Any-Wear Pod" and new app architecture

The "WHOOP Body" line was announced alongside WHOOP 4.0 in 2021 ([WHOOP Press: Introducing WHOOP 4.0 and WHOOP Body Featuring Any-Wear Technology](https://www.whoop.com/us/en/press-center/introducing-4-0-whoop-body-any-wear-technology/), [PR Newswire mirror](https://www.prnewswire.com/news-releases/introducing-whoop-4-0-and-whoop-body-featuring-any-wear-technology-301371503.html)) as sensor-embedded apparel (the strap slips into a fabric pod). The 2025 refresh added the **Any-Wear Pod** for 5.0 ([WHOOP shop — Any-Wear Pod](https://shop.whoop.com/us/en/products/5-0-any-wear-pod/), [WHOOP — Apparel Accessories — Bands and Smart Apparel](https://www.whoop.com/us/en/thelocker/unlocking-the-future-of-wearable-performance/), [WHOOP — Best Pulse Points Besides the Wrist](https://www.whoop.com/us/en/thelocker/what-are-the-best-pulse-points/)). The pod is *passive* — same sensor in different fabric mount. No new BLE protocol implied for the pod itself.

The "new device architecture" Whoop refers to in marketing ([WHOOP — Everything launched in 2025](https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/), [WHOOP — what's coming soon in 2025](https://www.whoop.com/us/en/thelocker/inside-look-whats-next-for-whoop-in-2025/)) is the **5.0 silicon** (Ambiq Apollo*, see §3.2) plus a server-side AI pipeline ("Coach", journal correlations). There's no documented August 2025 *protocol* refresh; the public surface area covers app features only.

An interesting adjacent claim from the 5.0 launch coverage: WHOOP is repositioning around longevity ("Whoop Age", "Healthspan"), which puts the BP / ECG features front and centre and increases the surface area FDA cares about. ([Bloomberg review of 5.0 / MG](https://www.bloomberg.com/news/features/2025-05-08/review-whoop-5-0-whoop-mg-add-ecg-blood-pressure-subscription-from-199), [Tom's Guide WHOOP 5.0 review](https://www.tomsguide.com/wellness/fitness-trackers/whoop-5-0-review-should-you-give-a-whoop-about-this-new-tracker), [Man of Many WHOOP MG review](https://manofmany.com/tech/gear/whoop-5-mg)).

---

## 5. Researcher / community map

People doing actual work (not API wrappers):

| Handle | Real name | Best contact | Focus | Recent activity |
|---|---|---|---|---|
| `jogolden` | John Fitzgerald | [@jogold32 on X](https://x.com/jogold32/status/1875993250798182423), [johnfitz.me](https://johnfitz.me/projects/) | WHOOP 4.0 BLE protocol, Web Bluetooth client. Previously did PS4 kernel / Ghidra work, COD Ghosts mod, PPC decompiler. | Repo opened Jan 2025, 6 commits on main, 4 open issues; no significant activity since mid-2025 |
| `bWanShiTong` | unknown | [github.com/bWanShiTong](https://github.com/bWanShiTong) | The most active WHOOP RE practitioner. Wrote the canonical protocol doc, Rust CLI, simulator. | 43 commits on `openwhoop` master, 5 open issues including the 5.0 testing request |
| `christianmeurer` | Christian Meurer | [github.com/christianmeurer](https://github.com/christianmeurer) | Python BLE reader for 4.0; clean single-shot project, well-cited DMCA §1201(f) framing | 1 commit on master; not actively maintained |
| `furent` | unknown | [github.com/furent](https://github.com/furent) | Filed openwhoop issues #1 and #2 (high-freq sync, BLE disconnects) | Issue activity Jan 2025 |
| `0x090909` | unknown | issue filer | Pushed for Android/iOS integration on `openwhoop` | Apr 2026 |
| `davidtalas` | unknown | issue filer | Volunteer with spare 5.0 unit | May 2026 |
| `ma-2a` | unknown | issue filer | "Local data capture for expired Whoop devices" — the exact user need we'd serve | May 2025 |
| `nekkid-yoga` | unknown | repo owner | Battery pack USB reset (C# / Windows) | Active |

The notable academic / security venues that have *not yet* published on Whoop:
- DEF CON: no Whoop talk listed.
- Black Hat / Black Hat USA: no Whoop talk listed.
- RECON / DerbyCon / OSDFCon: no Whoop talk listed.
- CHES 2022 ([BreakMi paper](https://hexhive.epfl.ch/publications/files/22CHES.pdf)): targeted Xiaomi, not Whoop.
- Sensors / MDPI 2025 ([BLE MITM study](https://www.mdpi.com/1424-8220/25/6/1815)): Polar / Garmin / Xiaomi only.

This is mildly surprising. Plausible explanation: small-N user base (vs. Fitbit / Apple / Xiaomi at 10M+ units), and the subscription model means devices are typically returned to Whoop after cancellation rather than ending up at security researchers' workbenches.

---

## 6. Feasibility ratings and recommendations

### 6.1 Firmware OTA path — *open research problem*

**Rating:** Open research problem.

**Why:** Three compounding blockers. (1) No public extracted firmware blob exists, so we can't even study the image format. (2) The write path almost certainly enforces a signature; without keys we can't sign a replacement. (3) The cloud component (`download-firmware` hits Whoop's CDN to fetch the official image) means even a "stock re-flash to recover" path requires a live Whoop account in good standing. The pieces are scattered across Whoop's app, their CDN, the strap's bootloader, and an Ambiq/Nordic chip's secure boot ROM — solving it requires winning on every layer.

**Recommendation:** Pursue *read-only* firmware capabilities only — version reporting (cmd 142 read), and image-hash sniffing to detect when Whoop pushes an update that would break our client. Do not attempt to write to flash. Spend a sprint (2 weeks) on this: implement version interrogation, parse the OpenWhoop downloaded image enough to identify Boylston vs Harvard halves, and ship a "firmware regression watch" feature that fires a warning to the user if Whoop has pushed an unrecognised firmware. That's the highest leverage per engineer-week, and it sits firmly inside the DMCA §1201(f) interoperability carve-out without provoking Whoop legally.

### 6.2 Pairing / virgin-mode flow — *partially doable, blocked by app↔server semantics*

**Rating:** Partially doable, blocked by the app↔server account-binding semantics (not by the BLE crypto itself).

**Why:** The BLE side is almost certainly tractable — Just-Works pairing on a screenless device is the textbook case, `crackle`-and-go for legacy pairing, or `bsniffhub` + iOS PacketLogger for Secure Connections. The actual blocker is everything *around* it: the Whoop app calls account-service REST endpoints to mint a device token tied to the strap's serial number, then the strap consumes that token via `ExitVirginMode`. Reproducing this requires either (a) Whoop-side bug-bounty work to find an unauthenticated device-binding endpoint, or (b) running the official Whoop app on Frida/AppCloner long enough to capture one onboarding, then replaying server-issued tokens. Path (a) violates ToS; path (b) is fragile against app updates.

**Recommendation:** Build a `whoop-simulator`-style honeypot (the `bWanShiTong/whoop-simulator` skeleton is the seed) and use it to enumerate every command + every event emitted during the official app's first-time pair flow on a *known* (already-bonded) strap. That gives us the BLE-side state machine for free, without ever attempting to bypass the cloud. Parallel: SSL-pin-bypass the Android app with Frida and capture the REST traffic — `jacc/whoop-re` and `jjur/whoop-sleep-HR-data-api` are the prior art for this. Document everything, ship nothing for first-time pair, lean on the "buy a new strap, finish the official onboarding once, then never open Whoop again" workflow that the current openwhoop user base already accepts. 4–8 weeks for full enumeration; first-time-pair *bypass* stays out of scope.

### 6.3 WHOOP 5.0 / MG protocol — *partially doable, requires hardware*

**Rating:** Partially doable, blocked by lack of a 5.0/MG unit in our hands; not blocked by any open research question once we have one.

**Why:** The work is concretely sequenced. (1) Buy a WHOOP 5.0 ($239 starter pack, [WHOOP shop](https://shop.whoop.com/us/en/products/5-0-any-wear-pod/)) or MG (subscription tier $399). (2) Run BLE scan + service discovery; this answers "is the custom service still `61080000-...`" in five minutes. (3) Capture HCI snoop while doing one full sync + one HR broadcast + one ECG reading (MG only); diff against our existing 4.0 captures. (4) Re-validate CRC poly. With one engineer-week of capture and analysis we can answer 80% of the open questions. The remaining 20% is the ECG channel and BP calibration commands, which are MG-specific and would take perhaps another 2 weeks.

**Recommendation:** Order one WHOOP 5.0 (not MG — the marginal information per dollar is much higher on the base unit since MG just adds two features on the same wire). Do a one-week BLE-discovery sprint. Publish a `whoop-5.0-protocol-diff.md` doc to the same standard as our existing `whoop-ble-protocol-reference.md`. **Don't** publicly ship 5.0 support in our client until we've also figured out backwards compatibility — the lift on the connection-handler is non-trivial if Ambiq's BLE controller behaves differently from Nordic's. Stretch goal: contact `davidtalas` (openwhoop issue #24) — they already have a unit and offered help, but got no response from `bWanShiTong`. We could collaborate.

---

## 7. Cited sources (consolidated, in document order)

### Whoop official
- [WHOOP Support — How to Update Your Product's Firmware](https://support.whoop.com/s/article/WHOOP-3-0-and-4-0-How-to-Update-Your-Product-s-Firmware)
- [WHOOP Support — How To Update your Strap's Firmware](https://support.whoop.com/hc/en-us/articles/360042528574-How-To-Update-your-Strap-s-Firmware)
- [WHOOP Support — WHOOP Strap Firmware Release Notes](https://support.whoop.com/hc/en-us/articles/360042975113-WHOOP-Strap-Firmware-Release-Notes)
- [WHOOP Support — WHOOP 4.0 Firmware Release Notes](https://support.whoop.com/s/article/WHOOP-4-0-Firmware-Release-Notes)
- [WHOOP Support — WHOOP 5.0/MG Firmware Release Notes](https://support.whoop.com/s/article/WHOOP-5-0-MG-Firmware-Release-Notes)
- [WHOOP Support — Setting Up Your WHOOP 4.0](https://support.whoop.com/s/article/Setting-Up-Your-WHOOP-4-0)
- [WHOOP Support — Setting Up Your New WHOOP Strap](https://support.whoop.com/hc/en-us/articles/360019452834-Setting-Up-Your-New-WHOOP-Strap)
- [WHOOP Support — WHOOP Sensor Pairing Guide (4.0 iOS)](https://support.whoop.com/s/article/WHOOP-4-0-iOS-Connectivity-and-Pairing?language=en_US)
- [WHOOP Support — Putting the WHOOP Strap into Pairing Mode](https://support.whoop.com/hc/en-us/articles/360038582374-Putting-the-WHOOP-Strap-into-Pairing-Mode)
- [WHOOP Support — WHOOP Strap 3.0 Android Connectivity and Pairing](https://support.whoop.com/hc/en-us/articles/360025115374-WHOOP-Strap-3-0-Android-Connectivity-and-Pairing)
- [WHOOP Support — WHOOP Strap 3.0 BLE Tips and Tricks](https://www.whoop.com/us/en/thelocker/whoop-strap-3-0-bluetooth-low-energy-tips-and-tricks/)
- [WHOOP Support — Unlock New with WHOOP MG](https://support.whoop.com/s/article/Unlock-New-with-WHOOP-MG?language=en_US)
- [WHOOP — Introducing 5.0 and MG](https://www.whoop.com/us/en/thelocker/introducing-whoop-5-0-and-whoop-mg/)
- [WHOOP — 5.0 and MG press release](https://www.whoop.com/us/en/press-center/whoop-unveils-5.0-MG/)
- [BusinessWire — WHOOP Unveils 5.0 and MG](https://www.businesswire.com/news/home/20250508546933/en/WHOOP-Unveils-WHOOP-5.0-and-WHOOP-MG-Powerful-New-Devices-with-Breakthrough-Health-and-Longevity-Features)
- [WHOOP — Everything launched in 2025](https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/)
- [WHOOP — What's coming soon in 2025](https://www.whoop.com/us/en/thelocker/inside-look-whats-next-for-whoop-in-2025/)
- [WHOOP — WHOOP Body Future of Wearable Technology](https://www.whoop.com/us/en/thelocker/whoop-body-wearable-technology-future/)
- [WHOOP shop — Any-Wear Pod](https://shop.whoop.com/us/en/products/5-0-any-wear-pod/)
- [WHOOP — Apparel Accessories — Bands and Smart Apparel](https://www.whoop.com/us/en/thelocker/unlocking-the-future-of-wearable-performance/)
- [WHOOP — Best Pulse Points Besides the Wrist](https://www.whoop.com/us/en/thelocker/what-are-the-best-pulse-points/)
- [WHOOP — Government & Defense (NSA SCIF-approved)](https://www.whoop.com/us/en/tactical/)
- [WHOOP — Press: 4.0 and WHOOP Body launch (2021)](https://www.whoop.com/us/en/press-center/introducing-4-0-whoop-body-any-wear-technology/)
- [PR Newswire — Introducing WHOOP 4.0 and WHOOP Body Featuring Any-Wear Technology](https://www.prnewswire.com/news-releases/introducing-whoop-4-0-and-whoop-body-featuring-any-wear-technology-301371503.html)

### Whoop community forum
- [WHOOP Community — Firmware update WHOOP 5.0 thread](https://www.community.whoop.com/t/firmware-update/4535)
- [WHOOP Community — Firmware update 50.35.2.0](https://www.community.whoop.com/t/firmware-update-50-35-2-0-any-details/10969)
- [WHOOP Community — New firmware 50.36.1.0](https://www.community.whoop.com/t/new-firmware-50-36-1-0/13928)
- [WHOOP Community — How do I update the firmware](https://www.community.whoop.com/t/how-do-i-update-the-firmware-on-my-whoop-strap/244)
- [WHOOP Community — Setup issue: new WHOOP 5.0](https://www.community.whoop.com/t/setup-issue-new-whoop-5-0/1284)
- [WHOOP Community — How do I take an ECG reading with the new WHOOP 5.0](https://www.community.whoop.com/t/how-do-i-take-an-ecg-reading-with-the-new-whoop-5-0/423)

### Reverse-engineering projects
- [GitHub — jogolden/whoomp](https://github.com/jogolden/whoomp)
- [jogolden.github.io/whoomp/](https://jogolden.github.io/whoomp/)
- [johnfitz.me/projects](https://johnfitz.me/projects/)
- [@jogold32 — original WHOOP RE tweet (Jan 2025)](https://x.com/jogold32/status/1875993250798182423)
- [GitHub — bWanShiTong/openwhoop](https://github.com/bWanShiTong/openwhoop)
- [GitHub — bWanShiTong/openwhoop issue #24 (WHOOP 5.0 test)](https://github.com/bWanShiTong/openwhoop/issues/24)
- [GitHub — bWanShiTong/reverse-engineering-whoop-post](https://github.com/bWanShiTong/reverse-engineering-whoop-post)
- [Mintlify wiki — bWanShiTong RE guide](https://mintlify.wiki/bWanShiTong/reverse-engineering-whoop-post/getting-started/prerequisites)
- [GitHub — bWanShiTong/whoop-simulator](https://github.com/bWanShiTong/whoop-simulator)
- [GitHub — bWanShiTong/reverse-engineering-whoop](https://github.com/bWanShiTong/reverse-engineering-whoop)
- [GitHub — christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader)
- [GitHub — nekkid-yoga/Whoop4.0BatteryReset](https://github.com/nekkid-yoga/Whoop4.0BatteryReset)
- [GitHub — jjur/whoop-sleep-HR-data-api](https://github.com/jjur/whoop-sleep-HR-data-api)
- [GitHub — jacc/whoop-re](https://github.com/jacc/whoop-re)
- [GitHub Topic — whoop](https://github.com/topics/whoop)

### FCC filings
- [fcc.report — Whoop Inc. company page](https://fcc.report/company/Whoop-Inc)
- [FCC ID 2AJ2X-WS50 (WHOOP 5.0)](https://fccid.io/2AJ2X-WS50)
- [FCC ID 2AJ2X-WS50 exhibit list](https://fcc.report/FCC-ID/2AJ2X-WS50/)
- [FCC ID 2AJ2X-WG50 (WHOOP MG)](https://fccid.io/2AJ2X-WG50)
- [FCC ID 2AJ2X-WG50 exhibit list](https://fcc.report/FCC-ID/2AJ2X-WG50/)
- [FCC ID 2AJ2X-WD50 (Charger)](https://fccid.io/2AJ2X-WD50)
- [FCC ID 2AJ2X-WB50 (Battery pack)](https://fccid.io/2AJ2X-WB50)
- [FCC ID 2AJ2X-WS30 (WHOOP 3.0) Teardown Internal Photos](https://fccid.io/2AJ2X-WS30/Internal-Photos/Internal-Photos-4265037)
- [Whoop Gen 3 User Manual (FCC)](https://fcc.report/FCC-ID/2AJ2X-WS30/4265039.pdf)

### FDA / regulatory
- [FDA — 510(k) K243236 WHOOP ECG Feature](https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K243236)
- [FDA decision letter PDF K243236](https://www.accessdata.fda.gov/cdrh_docs/pdf24/K243236.pdf)
- [Innolitics — K243236 summary](https://fda.innolitics.com/submissions/CV/subpart-c%E2%80%94cardiovascular-monitoring-devices/QDA/K243236)
- [FDA Warning Letter to WHOOP Inc 709755 (July 14 2025)](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025)
- [JMIR — WHOOP, There It Is: Lessons From WHOOP's FDA Warning Letter](https://www.jmir.org/2026/1/e90882)
- [The FDA Group — WHOOP warning letter breakdown](https://insider.thefdagroup.com/p/fda-warning-letter-breakdown-whoop)
- [Men's Fitness — WHOOP MG keeps BPI despite FDA warning](https://www.mensfitness.com/news/whoop-mg-fda)
- [CNBC — Whoop says FDA "overstepping its authority"](https://www.cnbc.com/2025/07/15/whoop-fda-blood-pressure-feature-wearables.html)
- [MobiHealthNews — WHOOP pushes back on FDA](https://cloudgate.mobihealthnews.com/news/whoop-pushes-back-fda-over-blood-pressure-feature)
- [MD+DI — WHOOP BPI medical-device fight](https://www.mddionline.com/wearable-medical-devices/to-be-or-not-to-be-a-medical-device-fda-vs-whoop)
- [WHOOP — Why WHOOP stands behind BPI](https://www.whoop.com/us/en/thelocker/why-whoop-stands-behind-blood-pressure-insights/)
- [HackerOne — WHOOP bug bounty](https://hackerone.com/whoop_bug_bounty?type=team)

### Patents
- [USPTO — Whoop Inc patent filings](https://uspto.report/company/Whoop-Inc/patents)
- [Justia — Whoop Inc patents](https://patents.justia.com/assignee/whoop-inc)
- [Google Patents — US8945017B2 Wearable heart rate monitor](https://patents.google.com/patent/US8945017B2/en)
- [Google Patents — USD792597S1 Wearable continuous physiological monitoring device](https://patents.google.com/patent/USD792597S1/en)
- [Verdict — WHOOP files patent for continuous health & fitness monitoring strap system](https://www.verdict.co.uk/whoop-files-patent-for-continuous-health-and-fitness-monitoring-wearable-strap-system/)
- [GreyB Insights — WHOOP patents key insights](https://insights.greyb.com/whoop-patents/)
- [GreyB Insights — WHOOP 4.0 wearables](https://insights.greyb.com/whoop-band-patents/)

### Chip / hardware data
- [Nordic press — WHOOP 4.0 uses nRF52840](https://www.nordicsemi.com/Nordic-news/2022/07/The-WHOOP-4-uses-Nordics-nRF52840-SoC)
- [TechInsights — WHOOP 5.0 (WG50) Deep Dive Teardown](https://www.techinsights.com/blog/whoop-50-wg50-deep-dive-teardown)
- [Electronics360 — TechInsights teardown summary](https://electronics360.globalspec.com/article/23159/techinsights-teardown-whoop-5-0)
- [Ambiq — Apollo3 Blue](https://ambiq.com/apollo3-blue/)
- [Ambiq — Apollo4 Blue](https://ambiq.com/product/apollo4-blue/)
- [Apollo4 SoC Datasheet](https://contentportal.ambiq.com/documents/20123/388400/Apollo4-SoC-Datasheet.pdf)
- [Apollo4 Blue Plus SoC Datasheet](https://ambiq.com/wp-content/uploads/2022/06/Apollo4-Blue-Plus-SoC-Datasheet.pdf)
- [Apollo4 Blue Lite Datasheet (Mouser)](https://www.mouser.com/datasheet/2/1494/Apollo4_Blue_Lite_Datasheet-3317499.pdf)
- [Ambiq — blueSPOT Bluetooth platform](https://ambiq.com/technology/bluespot/)
- [Ambiq Apollo SoC family overview](https://ambiq.com/soc/)
- [Analog Devices — MAX86178 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max86178.pdf)
- [PR Newswire — Clinical-grade AFE from ADI (MAX86178 launch)](https://www.prnewswire.com/news-releases/clinical-grade-afe-from-analog-devices-measures-four-vital-signs-for-remote-patient-monitoring-devices-301379832.html)
- [TDK — ICM-42688-P Datasheet PDF](https://product.tdk.com/system/files/dam/doc/product/sensor/mortion-inertial/imu/data_sheet/ds-000347-icm-42688-p-v1.6.pdf)
- [TDK — ICM-456xy family](https://invensense.tdk.com/products/motion-tracking/6-axis/icm-456xy/)

### Memfault
- [Memfault Docs — Coredump Collection](https://docs.memfault.com/docs/mcu/coredumps)
- [Memfault Docs — Debugging MCU coredumps with GDB](https://docs.memfault.com/docs/mcu/coredump-elf-with-gdb)
- [Memfault Docs — Data from Firmware to the Cloud](https://docs.memfault.com/docs/mcu/data-from-firmware-to-the-cloud)
- [Memfault Docs — Event Serialization Overview](https://docs.memfault.com/docs/mcu/event-serialization-overview)
- [Memfault Docs — Post Chunks with Memfault CLI](https://docs.memfault.com/docs/mcu/export-chunks-over-console)
- [Memfault Docs — Test patterns for chunks endpoint](https://docs.memfault.com/docs/mcu/test-patterns-for-chunks-endpoint)
- [Memfault Docs — Chunk Relay](https://docs.memfault.com/docs/mcu/chunk-relay)
- [Memfault Docs — Test data collection with GDB](https://docs.memfault.com/docs/mcu/test-data-collection-with-gdb)
- [Memfault Docs — Compact Logs](https://docs.memfault.com/docs/mcu/compact-logs)
- [GitHub — memfault/memfault-firmware-sdk](https://github.com/memfault/memfault-firmware-sdk)
- [memfault-firmware-sdk — coredump.h](https://github.com/memfault/memfault-firmware-sdk/blob/master/components/include/memfault/panics/coredump.h)
- [memfault-firmware-sdk — platform/coredump.h](https://github.com/memfault/memfault-firmware-sdk/blob/master/components/include/memfault/panics/platform/coredump.h)
- [memfault-firmware-sdk — memfault_gdb.py](https://github.com/memfault/memfault-firmware-sdk/blob/master/scripts/memfault_gdb.py)
- [Releases — memfault-firmware-sdk](https://github.com/memfault/memfault-firmware-sdk/releases)
- [memfault-firmware-sdk CHANGELOG](https://github.com/memfault/memfault-firmware-sdk/blob/master/CHANGELOG.md)
- [Interrupt — Linux Coredumps Part 1](https://interrupt.memfault.com/blog/linux-coredumps-part-1)
- [Embedded Artistry — Memfault overview](https://embeddedartistry.com/blog/2021/01/18/is-memfault-the-future-of-fault-debugging-we-think-so/)

### BLE security / pairing prior art
- [GitHub — mikeryan/crackle](https://github.com/mikeryan/crackle/)
- [crackle FAQ](https://github.com/mikeryan/crackle/blob/master/FAQ.md)
- [Darknet — crackle BLE encryption](https://www.darknet.org.uk/2017/02/crackle-crack-bluetooth-smart-encryption-ble/)
- [GitHub — homewsn/bsniffhub](https://github.com/homewsn/bsniffhub)
- [Adafruit — BLE Sniffer with nRF52840](https://learn.adafruit.com/ble-sniffer-with-nrf52840/working-with-wireshark)
- [Adafruit — Reverse Engineering a BLE Light Bulb](https://learn.adafruit.com/reverse-engineering-a-bluetooth-low-energy-light-bulb/sniff-protocol)
- [Reverse Engineering BLE Devices docs (readthedocs)](https://reverse-engineering-ble-devices.readthedocs.io/en/latest/protocol_reveng/00_protocol_reveng.html)
- [Codeberg — Gadgetbridge BT Protocol RE wiki](https://codeberg.org/Freeyourgadget/Gadgetbridge/wiki/BT-Protocol-Reverse-Engineering)
- [hexhive — BreakMi: Reversing Xiaomi Fitness Ecosystem (CHES 2022)](https://hexhive.epfl.ch/publications/files/22CHES.pdf)
- [Sensors / MDPI — Newer, the More Secure? BLE MITM on Fitness Trackers (2025)](https://www.mdpi.com/1424-8220/25/6/1815)
- [PMC mirror — same paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC11945526/)
- [Securelist — How I hacked my smart bracelet](https://securelist.com/how-i-hacked-my-smart-bracelet/69369/)
- [Crypto.iacr.org — Breaking BT Pairing (Fixed-Coordinate Invalid Curve Attack)](https://crypto.iacr.org/2019/affevents/wac/medias/Neumann-BreakingBluetoothPairing.pdf)
- [Novel Bits — Debugging BLE on iOS: HCI Capture & LTK Extraction](https://novelbits.io/debugging-sniffing-secure-ble-ios/)
- [Novel Bits — Android Bluetooth Debugging Guide PDF](https://novelbits.s3.us-east-2.amazonaws.com/Developer+Guides/Android+Bluetooth+Debugging+Guide.pdf)
- [Android Open Source — Verify and debug Bluetooth](https://source.android.com/docs/core/connect/bluetooth/verifying_debugging)
- [Medium — Decoding Bluetooth HCI logs on Android](https://medium.com/@basanta.behera/decoding-bluetooth-on-your-android-phone-understanding-and-analyzing-your-hci-log-2af36e221695)
- [Nordic infocenter — Sniffing the pairing procedure](https://infocenter.nordicsemi.com/topic/ug_sniffer_ble/UG/sniffer_ble/action_paired.html)
- [Nordic Developer Academy — Legacy vs LE Secure Connections](https://academy.nordicsemi.com/courses/bluetooth-low-energy-fundamentals/lessons/lesson-5-bluetooth-le-security-fundamentals/topic/legacy-pairing-vs-le-secure-connections/)
- [freeCodeCamp — How Does Bluetooth LE Secure Pairing Work?](https://www.freecodecamp.org/news/how-does-bluetooth-le-secure-pairing-work/)
- [Ellisys EEN_BT09 — Methods for Accessing a Link Key](https://www.ellisys.com/technology/een_bt09.pdf)

### Firmware extraction prior art
- [Security Innovation — Stealing Firmware from OTA Updates](https://blog.securityinnovation.com/stealing-firmware-from-over-the-air-updates)
- [Steven Foerster — Firmware RE with Binwalk and Ghidra](https://stevenfoerster.com/tutorials/firmware-extraction-and-reverse-engineering-with-binwalk-and-ghidra/)
- [Sergio Prado — RE router firmware with binwalk](https://sergioprado.blog/reverse-engineering-router-firmware-with-binwalk/)
- [GitHub — ReFirmLabs/binwalk](https://github.com/ReFirmLabs/binwalk)
- [GitHub — Adafruit_nRF52_Bootloader](https://github.com/adafruit/Adafruit_nRF52_Bootloader)
- [GitHub — oltaco/Adafruit_nRF52_Bootloader_OTAFIX](https://github.com/oltaco/Adafruit_nRF52_Bootloader_OTAFIX)
- [Nordic — nRF5 SDK v16 Secure boot](https://infocenter.nordicsemi.com/topic/sdk_nrf5_v16.0.0/lib_secure_boot.html)
- [Nordic — DFU via OTA using BLE](https://devzone.nordicsemi.com/f/nordic-q-a/96939/ncs-v2-2-0---device-firmware-update-dfu-via-ota-using-ble)
- [Nordic — Performing DFU in nRF Connect SDK](https://developer.nordicsemi.com/nRF_Connect_SDK/doc/2.0.0/matter/nrfconnect_examples_software_update.html)
- [GitHub — thegecko/web-bluetooth-dfu](https://github.com/thegecko/web-bluetooth-dfu)
- [Infineon — Secure DFU + Secure Boot on nRF52 with OPTIGA Trust X](https://github.com/Infineon/fwupd-secboot-optiga-trust)

### Reviews / press
- [the5krunner — WHOOP 4.0 vs 5.0 sensor architecture changes](https://the5krunner.com/2025/06/16/whoop-4-0-vs-whoop-5-0-sensor-architecture-changes-detailed-technical-content/)
- [the5krunner — 2026 WHOOP 5.0/MG review](https://the5krunner.com/2025/10/31/2026-whoop-5-0-mg-review-discount-accuracy-strain-recovery-athletes/)
- [the5krunner — WHOOP 5.0 unusual firmware accuracy boost](https://the5krunner.com/2025/10/06/whoop-5-0-gets-unusual-new-firmware-accuracy-boost-2/)
- [the5krunner — WHOOP 5 and MG how to keep them connected](https://the5krunner.com/2025/07/14/whoop-5-and-whoop-mg-how-to-keep-them-connected/)
- [Bloomberg — WHOOP 5.0/MG review](https://www.bloomberg.com/news/features/2025-05-08/review-whoop-5-0-whoop-mg-add-ecg-blood-pressure-subscription-from-199)
- [Tom's Guide — WHOOP 5.0 review](https://www.tomsguide.com/wellness/fitness-trackers/whoop-5-0-review-should-you-give-a-whoop-about-this-new-tracker)
- [Man of Many — WHOOP MG review](https://manofmany.com/tech/gear/whoop-5-mg)
- [Wareable — WHOOP 5/MG upgrade explainer](https://www.wareable.com/wearable-tech/how-to-upgrade-whoop-5-mg-explained)
- [TechRadar — $39 WHOOP subscription hack](https://www.techradar.com/health-fitness/fitness-trackers/redditors-have-found-a-whoop-subscription-hack-thats-saving-them-big-money-but-it-comes-with-caveats)
- [Gadgets & Wearables — WHOOP battery pack firmware (Jan 2025)](https://gadgetsandwearables.com/2025/01/28/whoop-battery-pack-firmware/)
- [Istanbul2023 — WHOOP forensic technical architecture analysis](https://www.istanbul2023.org/forensic-analysis-of-the-whoop/)

### Whoop HQ / company context
- [WHOOP Boston Office (Glassdoor)](https://www.glassdoor.com/Location/WHOOP-Boston-Location-EI_IE983091.0,5_IL.6,12_IC1154532.htm)
- [Built In Boston — WHOOP](https://www.builtinboston.com/company/whoop)
- [e-architect — WHOOP HQ Boston (Kenmore Square unveiling)](https://www.e-architect.com/america/whoop-headquarters-in-boston-massachusetts)
