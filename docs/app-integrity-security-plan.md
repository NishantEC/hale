# App integrity & device security plan (task #73)

Scope: mobile app (`apps/app`) + backend (`apps/backend`). Strap firmware is
out of scope (closed-source).

## Threat model (assumed)

The noop app stores biometric data (HR, HRV, sleep, motion). Realistic
adversaries:

1. **Lost / stolen device with PIN bypass** → reads SQLite + MMKV
2. **Hostile network** (public wifi, MITM) → snoops or modifies upload traffic
3. **Casual reverse-engineering** (jailbreak / Frida) → swap endpoints, steal
   session token from process memory
4. **Targeted account takeover** → brute-force auth endpoints
5. **Backend compromise** → exfiltrate the full dataset

Not in scope today: nation-state, persistent firmware-level malware on the
strap, side-channel against SQLCipher.

## Current state inventory

Compiled in the survey above. The findings that materially change risk:

| # | Finding | Severity |
|---|---|---|
| F1 | On-device SQLite is **unencrypted** (`db/index.ts:22` opens without key). 30k+ raw_sensor_records rows readable on a jailbroken or imaged device. | High |
| F2 | MMKV used without encryption flag (`storage/index.ts:3`). Stores user email plaintext; recovery state and view caches. | Medium |
| F3 | No TLS certificate pinning. A MITM with a planted root cert (corporate / public-wifi captive portal) can intercept upload traffic. | Medium |
| F4 | `CORS: origin: true` on backend (`main.ts:30-36`) accepts every origin. Combined with bearer auth this is mostly safe, but it removes a defense-in-depth layer. | Medium |
| F5 | **No rate limiting** on `/api/auth/sign-in/email` or `/api/auth/sign-up/email`. Brute-force exposed. | High |
| F6 | No jailbreak / root detection. Frida users can hook `fetch` and harvest tokens. | Low (until commercial launch) |
| F7 | Sentry init has **no PII scrubber** (mobile + backend `main.ts:6-13`). If Sentry gets enabled later, payloads leak. | Medium |
| F8 | BLE strap protocol has no app-level pairing token / replay nonce. Anyone within BLE range can probe / spoof — mitigated only by the strap requiring OS-level bonding. | Low (physical proximity) |
| F9 | Fixed 7-day JWT (`JWT_EXPIRES_IN=7d`), no refresh / rotation. Stolen token usable for full lifetime. | Medium |
| F10 | Hardcoded `JWT_SECRET=change-me-in-production` in `.env.example`. Prod uses Secret Manager (verified earlier — `NOOP_JWT_SECRET`). Risk only if someone copies the example to a real `.env`. | Low |

## Phased plan

### Phase 1 — High-leverage, low-effort (2-3 days)

1. **Auth rate-limit** — add `@nestjs/throttler` to `auth.controller.ts`,
   cap `/sign-in` and `/sign-up` at 5/min/IP. Closes F5.
2. **Tighten CORS** — replace `origin: true` with an explicit allow-list:
   `noop.enform.co`, `app.noop.enform.co`, the Cloud Run URL.
3. **MMKV encryption** — pass an `encryptionKey` derived from
   `expo-secure-store` (so the key itself sits in iOS Keychain / Android
   Keystore). Closes F2.
4. **Sentry scrubbing** — add `beforeSend` hook that strips `request.headers.
   authorization`, body fields named `email|password|token`, and any `Bearer
   …` substring. Wire both mobile + backend. Closes F7.

These four ship in one PR each and don't move user-facing behavior.

### Phase 2 — Higher-leverage, moderate-effort (1-2 weeks)

5. **SQLCipher on `noop.db`** — flip op-sqlite's `encryptionKey` to the same
   Keystore-backed key MMKV uses. Migration plan: dump + re-create on next
   launch. Closes F1, the biggest single risk surface.
6. **Token refresh + short access tokens** — switch to 15-min access + 30-day
   refresh, refresh endpoint protected by single-use rotation. Closes F9.
7. **TLS pinning** — add `react-native-ssl-pinning` for `api.noop.enform.co`,
   pin the leaf + intermediate. Closes F3.

### Phase 3 — Pre-public-launch (when commercial / app-store distribution
starts)

8. **Jailbreak / root detection** — `jail-monkey` or equivalent; on detect,
   sign the user out and refuse network ops. Closes F6.
9. **R8 / ProGuard** on Android, Hermes bytecode stripping config on iOS.
10. **BLE pairing token** — co-design with strap firmware if feasible; rotate
    a 32-byte shared secret per pair, sign every command frame.

### Out of scope for any of these phases

- 2FA / TOTP — explicitly deferred; can be added on top of the auth phase
  later if regulatory pressure (HIPAA, GDPR Art 32) lands.
- Custom code obfuscation — diminishing returns on RN apps.
- Strap firmware hardening — closed source; not actionable.

## Compliance bar (informational)

If the product moves toward consumer health markets:

- **HIPAA** — would require BAA with Cloud SQL host (verified Cloud Run + Cloud SQL on GCP can support BAA), encryption at rest (Phase 2), audit logging (not yet), incident response runbook (not yet).
- **GDPR Art 32** — encryption at rest + in transit, breach notification SLA, right-to-erasure flow. Phases 1+2 mostly cover the technical side; legal/process side is separate.

## Decisions needed from you

A. Greenlight Phase 1 as a single follow-up PR (no major tradeoffs)?
B. Phase 2 SQLCipher migration — accept the one-time DB recreate on upgrade
   (loses unsent outbound_queue rows that haven't drained)?
C. TLS pinning — pin only `api.noop.enform.co` (current prod), or also pin
   the Cloud Run direct URL (`*.a.run.app`) as fallback?
D. Timeline / urgency — is this driven by an app store submission, a
   compliance ask, or general hygiene?
