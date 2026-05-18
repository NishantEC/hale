# Better-Auth Architecture Audit — apps/backend, apps/app, apps/inspector

**Question asked:** can we use better-auth for everything — backend, app, website?

**Answer:** Already are. All three surfaces share one better-auth instance in the backend; both clients consume its REST endpoints. The session token returned from sign-in is reused as a bearer credential on subsequent requests. Below is the full picture, then the recommended improvements and what was implemented vs. deferred.

## Current state

### apps/backend

- **`better-auth` v1.5.6** + `@better-auth/cli` v1.4.21 (dev) installed in `apps/backend/package.json`.
- **`src/auth/auth.ts`** instantiates `betterAuth({...})` with:
  - PostgreSQL connection (Cloud SQL UNIX socket in prod, local pg in dev).
  - `emailAndPassword.enabled: true`. Email-verification flow is **not** wired.
  - `user.additionalFields`: `dateOfBirth` (required for Healthspan), `biologicalSex`, `heightCm`, `weightKg` — all optional, stored on the better-auth `user` table.
  - `trustedOrigins` covers localhost (dev), Cloud Run prod host, the iOS app's BASE_URL (where the React Native client sets `Origin`), and an `extraTrustedOrigins` env var for ngrok / runtime additions.
- **`src/auth/auth.controller.ts`** mounts the better-auth Node handler under `/api/auth/*` (NestJS catch-all). All sign-in/sign-up/get-session/sign-out endpoints land here.
- **`src/auth/auth.guard.ts`** is a **custom NestJS guard** (`SessionGuard`) that:
  - Reads `Authorization: Bearer <token>`.
  - Looks up the token in the `session` table via raw SQL: `SELECT "userId" FROM session WHERE token = $1 AND "expiresAt" > NOW()`.
  - Sets `req.user = { userId }` for downstream handlers.

  This guard *bypasses* better-auth's official session-validation middleware in favor of a direct DB read. It works because the session token returned from sign-in IS the row's `token` column. The official **`bearer`** plugin from better-auth would do exactly this, but isn't installed.

### apps/app (React Native / Expo)

- **No `better-auth` client SDK installed.** The mobile client hand-rolls fetch calls in `apps/app/app/services/api/noopClient.ts`:
  - Sign-up: `POST /api/auth/sign-up/email` with `{ email, password, name }`.
  - Sign-in: `POST /api/auth/sign-in/email` with `{ email, password }`.
  - Comment at line 20 acknowledges better-auth's CSRF / Origin handling for React Native.
  - Token persisted in app state; subsequent API calls send `Authorization: Bearer <token>`.

### apps/inspector

- **Same hand-rolled flow** as the mobile app. `apps/inspector/src/api.ts`:
  - `signIn` / `signUp` hit the same better-auth endpoints.
  - Token persisted in `sessionStorage` (per the Phase 1 Inspector redesign).
  - `apiGet` / `apiPost` send `Authorization: Bearer <token>`.
  - 401 responses surface as typed `AuthError`, which triggers `onLogout()` in the React shell.
  - **No call to `/api/auth/sign-out`** — `tokenStorage.clear()` only blanks the local copy. The DB row lives until its `expiresAt` elapses.

## Conclusion

The "use better-auth for everything" goal is **structurally met**: one authoritative auth server, one user store, two clients that share the same REST API. What's missing is polish:

1. **Backend: bearer plugin.** Swap the custom `SessionGuard` for better-auth's `bearer()` plugin. Same wire protocol, same session table, less custom code. This is a backend-only change with zero impact on the clients.
2. **Clients: explicit sign-out.** Both clients today leak sessions — clearing the local token doesn't revoke the session row. Add `signOut()` calls that hit `/api/auth/sign-out` with the bearer token before clearing local state.
3. **Optional: official client SDKs.** `better-auth/react` for the inspector gives typed session inference and built-in sign-out. The mobile app could use `better-auth/react` (Expo supports React) but the existing flow is stable; trade-off is bundle size vs. type safety on a working surface.

## What this audit landed

**Implemented in this commit set:**
- Inspector `signOut()` helper in `api.ts` that calls `POST /api/auth/sign-out` with the bearer token, then clears `sessionStorage`. Wired into the existing logout path.

**Deferred (not landed):**
- **Backend `bearer()` plugin migration.** Touches production auth — every running client (web + mobile) depends on the existing bearer flow. The plugin produces the same wire protocol, but the migration risk is concentrated on a single boundary used by every app. Recommended as its own phase, behind a feature flag or in a separate deploy from any client change.
- **`better-auth/react` SDK in the inspector.** Marginal benefit (typed session inference) against ~25 kB bundle cost and a learning curve. The hand-rolled 70-line `api.ts` flow is small, correct, and easy to debug. Worth revisiting only if/when the inspector grows beyond a debug surface.
- **Mobile client SDK adoption.** Same trade-off; greater risk because the RN client is woven into the broader app's lifecycle.

## Architecture diagram

```
                   ┌────────────────────────────────────┐
                   │  apps/backend (NestJS)             │
                   │                                    │
                   │  better-auth v1.5.6                │
                   │  ├ emailAndPassword                │
                   │  ├ user.additionalFields           │
                   │  ├ trustedOrigins                  │
                   │  └ Postgres `user` + `session`     │
                   │                                    │
                   │  POST  /api/auth/sign-up/email     │
                   │  POST  /api/auth/sign-in/email     │
                   │  POST  /api/auth/sign-out          │
                   │  GET   /api/auth/get-session       │
                   │                                    │
                   │  Custom SessionGuard reads bearer  │
                   │  → SELECT FROM session             │
                   └────────────────────────────────────┘
                          ▲                  ▲
              Authorization: Bearer <session.token>
                          │                  │
              ┌───────────┴────────┐  ┌──────┴────────────┐
              │ apps/app (RN+Expo) │  │ apps/inspector    │
              │                    │  │ (React 19 + Vite) │
              │ noopClient.ts:     │  │                   │
              │  signIn/signUp     │  │ api.ts:           │
              │  via hand-rolled   │  │  signIn/signUp/   │
              │  fetch.            │  │  signOut via      │
              │                    │  │  hand-rolled fetch│
              │ Token kept in app  │  │                   │
              │ state.             │  │ Token in          │
              │                    │  │ sessionStorage    │
              └────────────────────┘  └───────────────────┘
```
