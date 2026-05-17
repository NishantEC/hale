# WHOOP recovery test (Mac → strap via Python + bleak)

Ports chukfinley/whoopsi's smart-sync flow to a standalone Python script that
runs from your Mac. Lets us empirically verify whether `FORCE_TRIM(0, 0)`
actually recovers pre-trim data on a Gen4 (WHOOP 4.0) strap — independent of
our React Native app.

## Setup

```bash
cd /Users/nish/Documents/noop/scripts/whoop_recovery
python3 -m venv .venv
source .venv/bin/activate
pip install bleak
```

## Run

1. **Disable Bluetooth on both phones** (or at least make sure neither
   noop nor the official WHOOP app is actively connected). The strap can
   only have one BLE connection at a time.
2. Make sure the strap is on the wrist (or being worn) and within ~10ft
   of your Mac.
3. Run:
   ```bash
   python whoop_recovery.py
   ```

## What it does

1. Scans for the strap by name + Gen4 service UUID
2. Connects (Mac becomes the BLE central — may auto-bond)
3. Subscribes to CMD_FROM, EVENTS, DATA characteristics
4. Sends whoopsi's exact init sequence (`ABORT_HISTORICAL` →
   `GET_HELLO_EXT` → `GET_BATTERY_LEVEL` → `GET_EXTENDED_BATTERY_INFO`)
5. `GET_DATA_RANGE` — logs the trim cursor
6. `FORCE_TRIM(0, 0)` — the rewind command
7. `GET_DATA_RANGE` again — checks if cursor moved backwards
8. `SEND_HISTORICAL_DATA` — counts records flowing back, ACKs each burst

## Interpreting the output

- **`Sensor packets : 1000+`** → whoopsi's FORCE_TRIM technique works on
  Gen4. The 11-day window is recoverable. Next step: port the exact
  Maverick framing + smart-sync flow to the React Native app.
- **`Sensor packets : ~150`** → matches our normal sync. Gen4 firmware
  silently rejects FORCE_TRIM regardless of framing. The pre-trim data
  is genuinely unreachable from any BLE client.
- **`Sensor packets : 0`** → strap rejected SEND_HISTORICAL or the
  connection dropped. Try again with strap freshly charged.

## Safety

The script has a hard guard against `FORCE_TRIM_ALL` (the
`0xFEFEFEFE` sentinel that permanently consumes all data for the
current bond). It will refuse to send any FORCE_TRIM where either
sector or offset equals `0xFEFEFEFE`. Only `FORCE_TRIM(0, 0)` is sent.
