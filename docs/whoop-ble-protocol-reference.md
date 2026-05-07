# WHOOP 4.0 BLE Protocol Reference

Consolidated from all reference implementations in `resource/` and `resources/`.

Sources:
- `resource/whoomp.js`, `packet.js`, `file.js`, `queue.js`, `ui.js` — Web Bluetooth reference
- `resource/openwhoop/` — Rust reference (openwhoop-codec + openwhoop)
- `resource/openWhoop-2/` — Python reference (bleak + SQLAlchemy)
- `resource/reverse-engineering-whoop-post/` — Raw reverse engineering notes
- `resource/scripts/` — Python BLE client + analysis tools
- `resources/react-native-sleep-stages/` — React Native sleep chart reference

---

## 1. BLE Service & Characteristics

**Service UUID:** `61080001-8d6d-82b8-614a-1c8cb0f8dcc6`

| UUID Suffix | Full UUID | Name | Direction | Purpose |
|-------------|-----------|------|-----------|---------|
| `0002` | `61080002-8d6d-82b8-614a-1c8cb0f8dcc6` | CMD_TO_STRAP | Write | Commands sent to device |
| `0003` | `61080003-8d6d-82b8-614a-1c8cb0f8dcc6` | CMD_FROM_STRAP | Notify | Command responses from device |
| `0004` | `61080004-8d6d-82b8-614a-1c8cb0f8dcc6` | EVENTS_FROM_STRAP | Notify | Async events (battery, wrist, etc.) |
| `0005` | `61080005-8d6d-82b8-614a-1c8cb0f8dcc6` | DATA_FROM_STRAP | Notify | Sensor data & historical records |
| `0007` | `61080007-8d6d-82b8-614a-1c8cb0f8dcc6` | MEMFAULT | Notify | Firmware crash/debug logs |

Additionally, the standard **Heart Rate Service (0x180D)** with HR characteristic (0x2A37) is available but must be enabled via Command 14 (TOGGLE_GENERIC_HR_PROFILE).

---

## 2. Packet Frame Format

All communication uses framed binary packets (little-endian unless noted).

```
Offset  Size  Field         Description
─────── ───── ───────────── ─────────────────────────────────────────
0       1     SOF           Start of Frame, always 0xAA
1       2     Length        Payload length (u16 LE), includes Type+Seq+Cmd+Data
3       1     CRC-8         Checksum over Length bytes only (polynomial 0x07, init 0x00)
4       1     PacketType    Packet category (see §3)
5       1     Sequence      Sequence/version number (u8)
6       1     Command       Command or event number (u8)
7       N     Data          Variable-length payload
7+N     4     CRC-32        Checksum over entire payload (bytes 4..7+N), LE u32
```

**Total frame size** = 1 (SOF) + 2 (Length) + 1 (CRC-8) + Length + 4 (CRC-32) = Length + 8

### CRC-8 (Header)
- Polynomial: `0x07`
- Initial value: `0x00`
- Computed over the 2 Length bytes only

### CRC-32 (Payload)
- Polynomial: `0x4C11DB7` (normal) / `0xEDB88320` (reflected)
- Initial value: `0xFFFFFFFF`
- Reflect input: Yes
- Reflect output: Yes
- Final XOR: `0xFFFFFFFF`
- Equivalent to standard `zlib.crc32()` in Python
- Stored as little-endian u32

### Multi-Fragment Reassembly
BLE MTU limits packets to ~244 bytes per notification. Large packets span multiple notifications. The assembler:
1. Buffers incoming bytes (up to 65536 bytes)
2. Scans for SOF (0xAA)
3. Reads length, validates CRC-8
4. Waits for full frame (length + 4 bytes after header)
5. Validates CRC-32
6. Emits complete packet

---

## 3. Packet Types

| Code | Name | Direction | Characteristic | Description |
|------|------|-----------|----------------|-------------|
| 35 | Command | App → Device | CMD_TO_STRAP | Commands sent to strap |
| 36 | CommandResponse | Device → App | CMD_FROM_STRAP | Response to a command |
| 40 | RealtimeData | Device → App | DATA_FROM_STRAP | Live HR data (1 Hz when enabled) |
| 43 | RealtimeRawData | Device → App | DATA_FROM_STRAP | Raw optical/sensor data stream |
| 47 | HistoricalData | Device → App | DATA_FROM_STRAP | Stored sensor records (V7/V9/V12/V18/V24) |
| 48 | Event | Device → App | EVENTS_FROM_STRAP | Async device events |
| 49 | Metadata | Device → App | DATA_FROM_STRAP | History transfer control |
| 50 | ConsoleLogs | Device → App | DATA_FROM_STRAP | Firmware debug output |
| 51 | RealtimeImuDataStream | Device → App | DATA_FROM_STRAP | Live IMU data (100 samples/packet) |
| 52 | HistoricalImuDataStream | Device → App | DATA_FROM_STRAP | Stored IMU data (100 samples/packet) |

---

## 4. Command Numbers (App → Device)

### System & Control

| Code | Name | Payload | Purpose |
|------|------|---------|---------|
| 1 | LinkValid | `[0x00]` | Verify BLE link is active (keepalive) |
| 2 | GetMaxProtocolVersion | — | Query protocol version support |
| 7 | ReportVersionInfo | — | Request firmware version |
| 10 | SetClock | `[unix_u32_LE, 0,0,0,0,0]` (9 bytes) | Sync device RTC |
| 11 | GetClock | — | Query device RTC |
| 26 | GetBatteryLevel | — | Query battery percentage |
| 29 | RebootStrap | `[0x00]` | Soft reboot |
| 32 | PowerCycleStrap | — | Hard power cycle |
| 35 | GetHelloHarvard | `[0x00]` | Device identification handshake |
| 98 | GetExtendedBatteryInfo | — | Detailed battery metrics |
| 99 | ResetFuelGauge | — | Recalibrate battery |
| 145 | GetHello | — | Modern device identification (v2) |

### Data Streaming

| Code | Name | Payload | Purpose |
|------|------|---------|---------|
| 3 | ToggleRealtimeHR | `[0x01]` or `[0x00]` | Enable/disable live HR broadcast |
| 14 | ToggleGenericHRProfile | — | Enable/disable standard BLE HR service |
| 16 | ToggleR7DataCollection | `[0x01]` | Enable advanced data collection |
| 63 | SendR10R11Realtime | — | Legacy realtime data mode |
| 81 | StartRawData | — | Begin raw sensor streaming |
| 82 | StopRawData | — | End raw sensor streaming |
| 96 | EnterHighFreqSync | — | Enable high-frequency sync (~90x faster) |
| 97 | ExitHighFreqSync | — | Exit high-frequency sync |
| 105 | ToggleImuModeHistorical | `[0x01\|0x00]` | Enable/disable IMU in historical packets |
| 106 | ToggleImuMode | `[0x01\|0x00]` | Enable/disable IMU in realtime packets |
| 107 | EnableOpticalData | `[0x01, 0x01\|0x00]` | Enable/disable optical sensor output |
| 108 | ToggleOpticalMode | `[0x01, 0x01\|0x00]` | Toggle optical processing mode |

### Historical Data

| Code | Name | Payload | Purpose |
|------|------|---------|---------|
| 20 | AbortHistoricalTransmits | — | Cancel ongoing history sync |
| 22 | SendHistoricalData | `[0x00]` | Initiate history download |
| 23 | HistoricalDataResult | `[0x01, trim_u32_LE, 0,0,0,0]` (9 bytes) | ACK receipt of history block |
| 25 | ForceTrim | `[0xFE×8, 0x00]` | Erase all device memory (**destructive**) |
| 33 | SetReadPointer | — | Set history read start position |
| 34 | GetDataRange | — | Query available history range |

### Alarms & Haptics

| Code | Name | Payload | Purpose |
|------|------|---------|---------|
| 66 | SetAlarmTime | `[0x01, unix_u32_LE, 0,0,0,0]` (9 bytes) | Set wake alarm |
| 67 | GetAlarmTime | `[0x00]` | Query alarm setting |
| 68 | RunAlarm | — | Trigger alarm immediately |
| 69 | DisableAlarm | — | Clear alarm |
| 79 | RunHapticsPattern | — | Execute haptic vibration |
| 80 | GetAllHapticsPattern | — | Query available patterns |
| 122 | StopHaptics | — | Stop vibration immediately |

### Sensor Configuration

| Code | Name | Purpose |
|------|------|---------|
| 39 | SetLedDrive | Configure LED brightness |
| 40 | GetLedDrive | Query LED settings |
| 41 | SetTiaGain | Set transimpedance amplifier gain (PPG sensor) |
| 42 | GetTiaGain | Query TIA gain |
| 43 | SetBiasOffset | Set sensor bias |
| 44 | GetBiasOffset | Query bias |
| 84 | GetBodyLocationAndStatus | Query sensor wear status |
| 100 | CalibrateCapsense | Calibrate capacitive touch sensor |
| 123 | SelectWrist | Indicate left/right wrist placement |

### Firmware & Configuration

| Code | Name | Purpose |
|------|------|---------|
| 36 | StartFirmwareLoad | Initialize firmware update |
| 37 | LoadFirmwareData | Firmware data chunk |
| 38 | ProcessFirmwareImage | Finalize firmware |
| 45 | EnterBleDfu | Enter BLE firmware update mode |
| 83 | VerifyFirmwareImage | Validate firmware integrity |
| 115 | StartDeviceConfigKeyExchange | Begin config handshake |
| 116 | SendNextDeviceConfig | Send config parameter |
| 117 | StartFfKeyExchange | Begin feature flag key exchange |
| 118 | SendNextFf | Send next feature flag |
| 119 | SetDeviceConfigValue | Set config value |
| 120 | SetFfValue | Set feature flag |
| 121 | GetDeviceConfigValue | Query config value |
| 128 | GetFfValue | Query feature flag |
| 131 | SetResearchPacket | Set research data mode |
| 132 | GetResearchPacket | Query research mode |
| 140 | SetAdvertisingName | Set BLE name |
| 141 | GetAdvertisingName | Query BLE name |
| 142-144 | StartFirmwareLoadNew / LoadFirmwareDataNew / ProcessFirmwareImageNew | v2 firmware update protocol |

---

## 5. Event Numbers (Device → App)

Events arrive on `EVENTS_FROM_STRAP` characteristic with PacketType 48.

### Power & Charging

| Code | Name | Description |
|------|------|-------------|
| 3 | BatteryLevel | Battery percentage changed |
| 5 | External5vOn | External power connected |
| 6 | External5vOff | External power disconnected |
| 7 | ChargingOn | Charging started |
| 8 | ChargingOff | Charging stopped |
| 21 | BatteryPackConnected | External battery pack attached |
| 22 | BatteryPackRemoved | External battery pack detached |
| 63 | ExtendedBatteryInformation | Detailed battery report |

### Wrist & Contact

| Code | Name | Description |
|------|------|-------------|
| 9 | WristOn | Device worn (skin contact detected) |
| 10 | WristOff | Device removed from wrist |
| 14 | DoubleTap | User double-tapped device |

### BLE & Connection

| Code | Name | Description |
|------|------|-------------|
| 11 | BleConnectionUp | BLE connection established |
| 12 | BleConnectionDown | BLE connection lost |
| 23 | BleBonded | Device bonded with phone |
| 43 | BleSystemReset | BLE subsystem reset |
| 44 | BleSystemOn | BLE subsystem powered on |
| 45 | BleSystemInitialized | BLE initialization complete |

### Streaming State

| Code | Name | Description |
|------|------|-------------|
| 24 | BleHrProfileEnabled | Standard HR service activated |
| 25 | BleHrProfileDisabled | Standard HR service deactivated |
| 33 | BleRealtimeHrOn | Realtime HR streaming enabled |
| 34 | BleRealtimeHrOff | Realtime HR streaming disabled |
| 46 | RawDataCollectionOn | Raw data mode started |
| 47 | RawDataCollectionOff | Raw data mode stopped |
| 96 | HighFreqSyncPrompt | High-frequency sync available |
| 97 | HighFreqSyncEnabled | 100 Hz sync mode active |
| 98 | HighFreqSyncDisabled | 100 Hz sync mode inactive |

### Alarms & Haptics

| Code | Name | Description |
|------|------|-------------|
| 56 | StrapDrivenAlarmSet | Device set internal alarm |
| 57 | StrapDrivenAlarmExecuted | Internal alarm triggered |
| 58 | AppDrivenAlarmExecuted | App-initiated alarm triggered |
| 59 | StrapDrivenAlarmDisabled | Device disabled alarm |
| 60 | HapticsFired | Vibration motor activated |
| 100 | HapticsTerminated | Vibration motor stopped |

### System & Boot

| Code | Name | Description |
|------|------|-------------|
| 0 | Undefined | Unknown/unclassified |
| 1 | Error | Device error condition |
| 2 | ConsoleOutput | Debug log output |
| 4 | SystemControl | Firmware control message |
| 13 | RtcLost | RTC lost synchronization |
| 15 | Boot | Device powered on |
| 16 | SetRtc | RTC synchronized |
| 17 | TemperatureLevel | Temperature threshold reached |
| 18 | PairingMode | Entered pairing mode |
| 28 | FlashInitComplete | Flash storage initialized |
| 29 | StrapConditionReport | Health status report |
| 30 | BootReport | Boot sequence report |
| 31 | ExitVirginMode | Device initialization complete |

### Sensor Diagnostics

| Code | Name | Description |
|------|------|-------------|
| 32 | CaptouchAutothresholdAction | Capacitive sensor auto-calibration |
| 35 | AccelerometerReset | Accelerometer reinitialized |
| 36 | AfeReset | Analog front-end reinitialized |
| 37 | ShipModeEnabled | Low-power shipping mode entered |
| 38 | ShipModeDisabled | Shipping mode exited |
| 39 | ShipModeBoot | Boot from shipping mode |
| 40 | Ch1SaturationDetected | PPG channel 1 saturated (clipping) |
| 41 | Ch2SaturationDetected | PPG channel 2 saturated (clipping) |
| 42 | AccelerometerSaturationDetected | Accelerometer saturated |

### Data Management

| Code | Name | Description |
|------|------|-------------|
| 19 | SerialHeadConnected | Serial debug interface connected |
| 20 | SerialHeadRemoved | Serial debug interface disconnected |
| 26 | TrimAllData | Memory trim started |
| 27 | TrimAllDataEnded | Memory trim completed |

---

## 6. Metadata Types (History Transfer Control)

Metadata packets (PacketType 49) control the historical data download flow.

| Code | Name | Payload | Meaning |
|------|------|---------|---------|
| 1 | HistoryStart | `[unix_u32_LE(4), padding(6), count_u32_LE(4)]` | Batch of data incoming; count = total records |
| 2 | HistoryEnd | `[unix_u32_LE(4), padding(6), seqnum_u32_LE(4)]` | Batch complete; seqnum = trim pointer at offset [10:14] |
| 3 | HistoryComplete | `[unix_u32_LE(4), padding(6), status_u32_LE(4)]` | All history synced |

---

## 7. Command Response Parsing

### GetBatteryLevel (cmd 26)
```
Offset 2-3: Raw battery level (u16 LE)
Formula:    batteryLevel = rawValue / 10.0
Result:     Battery percentage (0-100%)
```

### ReportVersionInfo (cmd 7)
```
Offset 3+: 16 × u32 LE values
Harvard version  = v[0].v[1].v[2].v[3]
Boylston version = v[4].v[5].v[6].v[7]
```

### GetHelloHarvard (cmd 35)
```
Offset 7:   Charging status (u8, 0 = not charging, 1 = charging)
Offset 116: Wrist status (u8, 0 = off wrist, 1 = on wrist)
```

### GetClock (cmd 11)
```
Offset 2-5: Unix timestamp (u32 LE)
```

### RealtimeData (PacketType 40)
```
Offset 5: Heart rate (u8, 0-255 bpm)
```

### Console Logs (PacketType 50)
```
Raw data: data[7..length-1]
Filter:   Remove byte sequence [0x34, 0x00, 0x01]
Result:   UTF-8 decoded string
```

---

## 8. Historical Data Formats

The `Sequence` byte in the packet header determines the format version.

### 8.1 Generic Format (V7, V9, V18 — HR+RR only)

For packets where `seq NOT IN (12, 24)` or `data.length < 77`.

```
Offset  Size  Type     Field             Description
─────── ───── ──────── ───────────────── ──────────────────────────
0       4     u32 LE   sequenceNumber    Record sequence
4       4     u32 LE   unixTimestamp     Seconds since epoch
8       2     u16 LE   subseconds        Sub-second timing (0-65535)
10      4     —        flags/unknown     Status flags
14      1     u8       heartRate         Heart rate in BPM (0-255)
15      1     u8       rrCount           Number of valid RR intervals (0-4)
16      8     u16 LE×4 rrIntervals       RR intervals in milliseconds (0 = unused)
```

### 8.2 V12/V24 Format (Full Sensor Data — 77+ bytes)

For packets where `seq IN (12, 24)` and `data.length >= 77`. This is the primary format our app uses.

```
Offset  Size  Type     Field             Description
─────── ───── ──────── ───────────────── ──────────────────────────
0       4     u32 LE   sequenceNumber    Record sequence
4       4     u32 LE   unixTimestamp     Seconds since epoch
8       2     u16 LE   subseconds        Sub-second timing (0-1000)
10      2     u16 LE   flags             Status flags (unknown meaning)
12      1     u8       sensorM           Sensor mode indicator
13      1     u8       sensorN           Sensor mode indicator
14      1     u8       heartRate         Heart rate in BPM (0-255)
15      1     u8       rrCount           Number of valid RR intervals (0-4)
16      8     u16 LE×4 rrIntervals       RR intervals in ms (0 = unused)
24      2     u16 LE   ppgFlags          PPG status flags
26      2     u16 LE   ppgGreen          Green LED photodiode ADC (0-4095)
28      2     u16 LE   ppgRedIr          Red/IR LED photodiode ADC (0-4095)
30      3     —        reserved          Unused
33      4     f32 LE   gravityX          Gravity X-axis (normalized ~1.0g)
37      4     f32 LE   gravityY          Gravity Y-axis
41      4     f32 LE   gravityZ          Gravity Z-axis
45      3     —        reserved          Unused
48      1     u8       skinContact       0 = off-wrist, non-zero = worn
49      12    —        reserved          Unused/legacy
61      2     u16 LE   spo2Red           SpO2 red LED raw ADC (0-4095)
63      2     u16 LE   spo2IR            SpO2 infrared LED raw ADC (0-4095)
65      2     u16 LE   skinTempRaw       Skin temperature thermistor ADC (0-4095)
67      2     u16 LE   ambientLight      Ambient light photodiode ADC
69      2     u16 LE   ledDrive1         LED driver 1 current (mA)
71      2     u16 LE   ledDrive2         LED driver 2 current (mA)
73      2     u16 LE   respRateRaw       Respiratory rate raw value
75      2     u16 LE   signalQuality     Signal quality index (0-100)
77+     —     —        padding           Reserved
```

### 8.3 IMU Format (1188+ bytes per packet)

For PacketType 51 (realtime) or 52 (historical). Contains 100 6-axis samples.

**NOTE: IMU samples use BIG-ENDIAN i16, unlike the rest of the protocol.**

```
Offset   Size  Type      Field         Description
──────── ───── ───────── ───────────── ──────────────────────────
0        4     u32 LE    sequence      Sequence number
4        4     u32 LE    unixTimestamp Seconds since epoch
8        2     u16 LE    subseconds    Sub-second timing
10       75    —         reserved      Unknown
85       200   i16 BE×100 accelX       Accelerometer X (÷1875.0 → g)
285      200   i16 BE×100 accelY       Accelerometer Y (÷1875.0 → g)
485      200   i16 BE×100 accelZ       Accelerometer Z (÷1875.0 → g)
688      200   i16 BE×100 gyroX        Gyroscope X (÷15.0 → degrees/sec)
888      200   i16 BE×100 gyroY        Gyroscope Y (÷15.0 → degrees/sec)
1088     200   i16 BE×100 gyroZ        Gyroscope Z (÷15.0 → degrees/sec)
```

IMU sample rate: ~52 Hz (100 samples ≈ 1.9 seconds)

---

## 9. Sensor Conversion Formulas

| Sensor | Raw Field | Formula | Units | Valid Range |
|--------|-----------|---------|-------|-------------|
| Skin temperature | `skinTempRaw` | `raw × 0.04` | °C | raw 582-1125 → 23-45°C; raw < 100 = off-wrist |
| Gravity | `gravityX/Y/Z` | Already in g | g (9.81 m/s²) | ~±2.5g |
| SpO2 | `spo2Red`, `spo2IR` | Beer-Lambert ratio: `R = (AC_red/DC_red)/(AC_ir/DC_ir)` then `SpO2 = 110 - 25×R` | % | 70-100% (clamped) |
| Battery | Response offset 2-3 | `raw / 10.0` | % | 0-100% |
| RR intervals | `rrIntervals[0..rrCount]` | Direct value | ms | 0-3000ms |
| IMU Accel | `raw_i16` | `raw / 1875.0` | g | ~±2.5g |
| IMU Gyro | `raw_i16` | `raw / 15.0` | °/s | varies |

---

## 10. Protocol State Machines

### 10.1 Connection Initialization

```
1. Scan for WHOOP_SERVICE_UUID
2. Connect BLE
3. Discover services & characteristics
4. Subscribe to notifications: CMD_FROM_STRAP, EVENTS_FROM_STRAP, DATA_FROM_STRAP
5. Send: GetHelloHarvard (cmd 35, payload [0x00])
6. Send: SetClock (cmd 10) — sync device RTC
7. Send: ReportVersionInfo (cmd 7)
8. Send: GetBatteryLevel (cmd 26)
9. Send: EnterHighFreqSync (cmd 96) — optional, for faster data
10. Ready for commands
```

### 10.2 Historical Data Download

```
1. [Optional] Send: EnterHighFreqSync (cmd 96) — 90x faster transfer
2. Send: SendHistoricalData (cmd 22, payload [0x00])
3. Receive: Metadata HISTORY_START (code 1) — contains record count
4. Receive: Multiple HistoricalData packets (type 47)
   └─ Each contains 1+ sensor records in V7/V9/V12/V18/V24 format
5. Receive: Metadata HISTORY_END (code 2)
   └─ Contains trim pointer at offset [10:14] (u32 LE)
6. Send: HistoricalDataResult (cmd 23, payload [0x01, trim_u32_LE, 0,0,0,0])
7. Repeat steps 3-6 until...
8. Receive: Metadata HISTORY_COMPLETE (code 3) — all data synced
9. [Optional] Send: ExitHighFreqSync (cmd 97)
```

Timeout: 120 seconds of inactivity → abort.

### 10.3 Realtime Heart Rate

```
1. Send: ToggleRealtimeHR (cmd 3, payload [0x01]) — enable
2. Receive: RealtimeData packets (type 40) at ~1 Hz
   └─ Heart rate at payload[5] (u8)
3. Send: ToggleRealtimeHR (cmd 3, payload [0x00]) — disable
```

---

## 11. Health Algorithms (from openWhoop-2 reference)

### 11.1 Activity Classification (Gravity-Based)

```
Constants:
  GRAVITY_THRESHOLD = 0.01g
  SLEEP_WINDOW = 15 minutes
  SLEEP_STILL_RATIO = 0.70 (70%)

Stillness: delta = sqrt((Δgx)² + (Δgy)² + (Δgz)²) < 0.01g
Classification:
  Rolling 15-min window ≥70% still → "sleep"
  Current reading still → "rest"
  Else → "active"
```

### 11.2 Sleep Cycle Detection

```
Rules:
  Minimum sleep duration: 60 minutes
  Merge gaps < 20 minutes between sleep periods
  Absorb activity < 15 minutes within sleep

Output: SleepCycle { start_ts, end_ts, duration_seconds }
```

### 11.3 HRV (Heart Rate Variability)

```
RMSSD = sqrt(mean(diff(RR)²))          — milliseconds
SDNN  = std(RR, ddof=1)                 — milliseconds
Normalized HRV = min(100, ln(RMSSD) / 6.5 × 100)  — 0-100 (EliteHRV scale)

Frequency domain (Welch's method, 4 Hz):
  VLF: 0.003-0.04 Hz
  LF:  0.04-0.15 Hz  (sympathetic)
  HF:  0.15-0.40 Hz  (parasympathetic)
  LF/HF ratio
```

### 11.4 Baevsky Stress Index

```
SI = AMo / (2 × VR × Mo)
  AMo = mode_freq / total_count × 100
  VR  = (max_RR - min_RR) / 1000
  Mo  = mode / 1000

50ms histogram bins, minimum 120 RR intervals, capped at 10.0
Normal: 80-150, Mild stress: 1.5-2x, Severe: 5-10x
```

### 11.5 Strain Score (Edwards TRIMP)

```
Zone weights by %HRR = (HR - resting) / (max - resting) × 100:
  Zone 1: 50-60% → weight 1
  Zone 2: 60-70% → weight 2
  Zone 3: 70-80% → weight 3
  Zone 4: 80-90% → weight 4
  Zone 5: 90%+   → weight 5

TRIMP  = sum(sample_duration_min × zone_weight)
Strain = 21 × log(TRIMP + 1) / log(7201)     — capped 0-21.0

Minimum 600 samples (~10 min), defaults: resting_hr=60, max_hr=200
```

### 11.6 SpO2 (Beer-Lambert)

```
AC_red = std(spo2_red_values)
DC_red = mean(spo2_red_values)
AC_ir  = std(spo2_ir_values)
DC_ir  = mean(spo2_ir_values)

R    = (AC_red / DC_red) / (AC_ir / DC_ir)
SpO2 = 110.0 - 25.0 × R       — clamped [70-100%]

Minimum 30 valid readings (both red and IR > 0)
```

### 11.7 Sleep Consistency Score

```
CV (Coefficient of Variation) = std / mean × 100
Duration score = max(0, 100 - CV_duration)
Timing score   = mean(100 - CV_start, 100 - CV_end, 100 - CV_midpoint)
Overall        = mean(duration_score, timing_score)

Requires 2+ nights (ideally 7+)
```

---

## 12. Database Schema (openWhoop-2 reference)

### HeartRateRecord
Core sensor data with per-record computed fields:
- timestamp, subseconds, bpm, rr_intervals (JSON)
- Sensor fields (V12/V24): ppg_green, ppg_red_ir, gravity_x/y/z, skin_contact, spo2_red, spo2_ir, skin_temp_raw, ambient_light, resp_rate_raw, signal_quality
- Computed: activity, stress, spo2, skin_temp (Celsius)
- Unique on: (timestamp, subseconds)

### SleepCycleRecord
- start_ts, end_ts, duration_seconds
- min/max/avg bpm and HRV
- sleep score

### ActivityRecord
- start_ts, end_ts, duration_seconds
- activity_type (string), strain (float)

### DailyScoreRecord
- date (YYYY-MM-DD, unique)
- recovery, strain, sleep_score, hrv, rhr, spo2, skin_temp, resp_rate

---

## 13. Sleep Stage Visualization (React Native reference)

From `resources/react-native-sleep-stages/`:

### Stage Definitions

| Key | Position | Label | Color |
|-----|----------|-------|-------|
| awake | 0 (top) | Awake | #FE8A73 |
| rem | 1 | REM | #3FB1E7 |
| core | 2 | Core | #1B81FE |
| deep | 3 (bottom) | Deep | #403EA7 |

### Typical Distribution
- Awake: ~3%
- REM: ~22%
- Core (Light): ~50%
- Deep: ~25%

### Data Model
```typescript
type SleepSegment = {
  id: number;
  type: 'awake' | 'rem' | 'core' | 'deep';
  from: Date;
  to: Date;
};
```

### Visualization Pattern
- Hypnogram chart: 4 horizontal lanes (Deep → Core → REM → Awake, bottom to top)
- Color-coded bars per segment with smooth connectors between transitions
- Interactive cursor showing stage label, duration, time range
- Gradient mask overlay for visual depth
- Spring-based animations for transitions

---

## 14. What Our App Handles vs. What's Available

### Currently Implemented in Our App

| Feature | Source | App Layer | Backend Layer |
|---------|--------|-----------|---------------|
| BLE connection & packet assembly | V12/V24 only | ble-manager, packet-assembler | — |
| Historical data download | V12/V24 format | history-downloader, history-parser | pipeline/ingest |
| Realtime HR streaming | PacketType 40 | DashboardContext → RealtimeForwarder | telemetry/realtime |
| Device events | PacketType 48 | DashboardContext → EventForwarder | telemetry/events |
| Command service | ~15 commands | command-service | — |
| Sleep detection | Gravity-based | — | SleepEventEngine |
| Sleep stage classification | Random Forest | — | SleepStageClassifier |
| HRV (RMSSD, SDNN) | From RR intervals | — | pipeline (epoch features) |
| Wellness scoring | Daily balance | — | wellness-scoring |
| Strain score | Edwards TRIMP | — | derived-metrics |

### Available in References but NOT Implemented

| Feature | Reference Source | Notes |
|---------|-----------------|-------|
| IMU data (accel + gyro) | PacketType 51/52 | 100 samples/packet, 52 Hz, 6-axis |
| SpO2 calculation (Beer-Lambert) | openWhoop-2 `algos/spo2.py` | We store raw ADC but don't compute % |
| Skin temp conversion | openWhoop-2 `algos/temperature.py` | `raw × 0.04 = °C` |
| Baevsky Stress Index | openWhoop-2 `algos/stress.py` | From RR intervals |
| Sleep consistency score | openWhoop-2 `algos/sleep_consistency.py` | Multi-night CV analysis |
| HRV frequency domain | openWhoop-2 `algos/hrv.py` | LF/HF ratio via Welch's method |
| PPG green/red-IR raw values | V12/V24 offsets 26-29 | Not parsed in our history-parser |
| Ambient light sensor | V12/V24 offset 67-68 | Not parsed |
| LED drive current | V12/V24 offset 69-72 | Not parsed |
| Signal quality index | V12/V24 offset 75-76 | Not parsed |
| High-frequency sync (cmd 96/97) | openwhoop, openWhoop-2 | ~90x faster history download |
| MEMFAULT characteristic | UUID 0007 | Firmware debug logs |
| Console log parsing | PacketType 50 | data[7..N], filter [0x34,0x00,0x01] |
| Feature flags (A/B testing) | Config string packets | `general_ab_test`, `sigproc_10_sec_dp`, etc. |
| Firmware update protocol | Commands 36-38, 142-144 | Two generations of firmware update |

---

## 15. Known Protocol Quirks

1. **Sequence number is not validated** — device accepts packets with any seq value
2. **No application-layer encryption** — relies on standard BLE link encryption only
3. **IMU uses big-endian** (i16 BE) while everything else is little-endian
4. **Device may disconnect after ~10s of inactivity** during sync — requires reconnection logic
5. **RR intervals**: max 4 per packet, zero values must be skipped
6. **Skin temp raw < 100** means off-wrist (not a temperature reading)
7. **SpO2 ADC values** are raw photodiode counts, not percentages
8. **Gravity vector** is already in g units (not raw accelerometer)
9. **Historical data format** is determined by the `seq` field in the packet header, not a separate format indicator
10. **CRC-32 XOR output** differs between implementations — the reverse-engineering post uses `0xF43F44AC` while openwhoop uses standard `0xFFFFFFFF`. Both produce valid results depending on initial value choice.
