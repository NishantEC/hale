# Hale

A local-first, open-source health and recovery tracker for the **WHOOP 4.0**
strap. Hale talks to the strap directly over Bluetooth, decodes its sensor
stream, and computes sleep, recovery, strain, and related metrics **entirely
on-device** — no account, no cloud, no subscription, no server.

> **Not affiliated with WHOOP.** WHOOP is a trademark of WHOOP, Inc. This is an
> independent, clean-room interoperability project built for personal use and
> research. Use it with hardware you own, at your own risk.

## How it works

- The app connects to the strap over BLE, ingests raw sensor records, and
  stores them in an on-device SQLite database.
- A Rust compute engine (sleep detection, activity detection, sleep staging,
  wellness, derived metrics) runs **on the device** via a native module, so
  recovery/sleep/strain are computed locally and never leave the phone.
- Native OS backup (iCloud / Android Auto Backup) covers the derived data;
  raw records stay device-local and are recomputable.

## Repository layout

A small pnpm + Turborepo workspace — the app plus its Rust compute core:

| Path | What it is |
|---|---|
| `apps/app` | React Native / Expo app — the local-first client you run on your phone. |
| `apps/compute-engine` | Rust compute engine, compiled to a UniFFI native module that the app links and runs on-device. |

## Getting started

Prerequisites: **Node ≥ 20**, **pnpm 10**, **Rust** (stable toolchain), and
**Xcode** (for iOS) / **Android Studio** (for Android).

```sh
pnpm install
pnpm test         # turbo test (app)
```

Run the app on a device (iOS):

```sh
cd apps/app
npx expo run:ios --device "<your-device-udid>" --configuration Release
```

### Native compute module (iOS)

The on-device compute lives in `apps/compute-engine` (Rust). Its iOS bindings —
the UniFFI-generated Swift glue and the `HaleComputeFFI.xcframework` (a ~44 MB
prebuilt static library) — are **generated build artifacts and are not
committed to the repo**. Generate them from the `apps/compute-engine` crate via
UniFFI before your first iOS build; the output is consumed from
`apps/app/modules/hale-compute/ios/`.

## License

[MIT](./LICENSE).
