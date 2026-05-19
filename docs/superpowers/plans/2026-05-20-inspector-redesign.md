# Inspector Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current cluttered Inspector with a tight diagnostic surface: 4-chip health strip, merged Events card, daemon drilldown, Logs Copy/Export, 4-button Actions row, long-press to unlock Expert mode with grouped advanced tools.

**Architecture:** Build pure chip-state selectors first (unit-tested), then compose them into small focused components (HealthStrip / EventsCard / DaemonDrilldown / ActionsRow / ExpertActions). Re-orchestrate `DebugInspectorScreen.tsx` to use the new components and delete the old `LiveMonitorCard`, `DiagnosticsCard`, `ActionsCard`.

**Tech Stack:** React Native (Expo SDK 55), Phosphor icons via `phosphor-react-native`, `@react-native-clipboard/clipboard` (already in deps via expo-clipboard or to be added), Jest for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-20-inspector-redesign-design.md`

---

## File Map

**Create:**
- `apps/app/app/components/Inspector/selectors.ts` — pure derived state for chips
- `apps/app/test/components/Inspector/selectors.test.ts` — unit tests for selectors
- `apps/app/app/components/Inspector/Chip.tsx` — single health chip primitive
- `apps/app/app/components/Inspector/CoverageRingChip.tsx` — coverage ring variant
- `apps/app/app/components/Inspector/HealthStrip.tsx` — 4-chip row
- `apps/app/app/components/Inspector/EventsCard.tsx` — merged alerts + activity
- `apps/app/app/components/Inspector/DaemonDrilldown.tsx` — 4-stat collapsible
- `apps/app/app/components/Inspector/ActionsRow.tsx` — 4 default actions
- `apps/app/app/components/Inspector/ExpertActions.tsx` — 3 grouped expert sections
- `apps/app/app/components/Inspector/useExpertMode.ts` — long-press toggle hook

**Modify:**
- `apps/app/app/components/Inspector/LogsCard.tsx` — add Copy, switch to icon-only
- `apps/app/app/components/Inspector/SyncProgressCard.tsx` — add 500ms pass-transition damp
- `apps/app/app/screens/DebugInspectorScreen.tsx` — re-orchestrate; delete old card references

**Delete:**
- `apps/app/app/components/Inspector/LiveMonitorCard.tsx`
- `apps/app/app/components/Inspector/DiagnosticsCard.tsx`
- `apps/app/app/components/Inspector/ActionsCard.tsx`

---

## Task 1: Chip-state selectors

**Files:**
- Create: `apps/app/app/components/Inspector/selectors.ts`
- Create: `apps/app/test/components/Inspector/selectors.test.ts`

- [ ] **Step 1: Write failing tests for `strapChipState`**

```ts
// apps/app/test/components/Inspector/selectors.test.ts
import {
  strapChipState,
  phoneChipState,
  backendChipState,
  coverageChipState,
} from "@/components/Inspector/selectors"

describe("strapChipState", () => {
  test("ready + on wrist → green / 'on wrist · 38%'", () => {
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: true,
        batteryLevel: 38,
        lastStreamAt: Date.now(),
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "green", sub: "on wrist · 38%" })
  })

  test("ready + off wrist → green / 'off wrist · 38%'", () => {
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: false,
        batteryLevel: 38,
        lastStreamAt: Date.now(),
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "green", sub: "off wrist · 38%" })
  })

  test("connecting → amber / '—'", () => {
    expect(
      strapChipState({
        connectionState: "connecting",
        isWorn: false,
        batteryLevel: null,
        lastStreamAt: null,
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "amber", sub: "—" })
  })

  test("disconnected → red / '—'", () => {
    expect(
      strapChipState({
        connectionState: "disconnected",
        isWorn: false,
        batteryLevel: null,
        lastStreamAt: null,
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "red", sub: "—" })
  })

  test("ready + stream silent >3min → 'stream silent'", () => {
    const now = 10_000_000
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: true,
        batteryLevel: 50,
        lastStreamAt: now - 200_000,
        backlogChunks: 0,
        nowMs: now,
      }),
    ).toEqual({ dot: "green", sub: "stream silent" })
  })

  test("ready + backlog pending → 'backlog · 22 chunks'", () => {
    const now = 10_000_000
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: true,
        batteryLevel: 50,
        lastStreamAt: now,
        backlogChunks: 22,
        nowMs: now,
      }),
    ).toEqual({ dot: "green", sub: "backlog · 22 chunks" })
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
cd apps/app && yarn jest test/components/Inspector/selectors.test.ts -t "strapChipState" 2>&1 | tail -15
```

Expected: `Cannot find module '@/components/Inspector/selectors'`

- [ ] **Step 3: Implement `strapChipState`**

```ts
// apps/app/app/components/Inspector/selectors.ts
export type Dot = "green" | "amber" | "red"

export type StrapInput = {
  connectionState: "ready" | "connecting" | "disconnected"
  isWorn: boolean
  batteryLevel: number | null
  lastStreamAt: number | null
  backlogChunks: number
  nowMs: number
}

const STREAM_SILENT_MS = 3 * 60_000

export function strapChipState(i: StrapInput): { dot: Dot; sub: string } {
  if (i.connectionState === "disconnected") return { dot: "red", sub: "—" }
  if (i.connectionState === "connecting") return { dot: "amber", sub: "—" }
  // ready
  if (i.backlogChunks > 0) {
    return { dot: "green", sub: `backlog · ${i.backlogChunks} chunks` }
  }
  if (i.lastStreamAt != null && i.nowMs - i.lastStreamAt > STREAM_SILENT_MS) {
    return { dot: "green", sub: "stream silent" }
  }
  const bat = i.batteryLevel != null ? `${Math.round(i.batteryLevel)}%` : "—"
  const wear = i.isWorn ? "on wrist" : "off wrist"
  return { dot: "green", sub: `${wear} · ${bat}` }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/app && yarn jest test/components/Inspector/selectors.test.ts -t "strapChipState" 2>&1 | tail -10
```

Expected: `6 passed`

- [ ] **Step 5: Write failing tests for `phoneChipState`**

Append to `apps/app/test/components/Inspector/selectors.test.ts`:

```ts
describe("phoneChipState", () => {
  const base = {
    daemonRunning: true,
    lastTickAt: 10_000_000,
    daemonTicks: 38,
    nowMs: 10_000_000,
    appErrorsLast5min: 0,
  }
  test("running + fresh tick → green / 'daemon · 38 ticks'", () => {
    expect(phoneChipState(base)).toEqual({ dot: "green", sub: "daemon · 38 ticks" })
  })
  test("running + stale tick → amber", () => {
    expect(
      phoneChipState({ ...base, lastTickAt: 10_000_000 - 120_000 }),
    ).toEqual({ dot: "amber", sub: "daemon · 38 ticks" })
  })
  test("stopped → amber / 'daemon stopped'", () => {
    expect(phoneChipState({ ...base, daemonRunning: false })).toEqual({
      dot: "amber",
      sub: "daemon stopped",
    })
  })
  test("app errors → red", () => {
    expect(phoneChipState({ ...base, appErrorsLast5min: 3 })).toEqual({
      dot: "red",
      sub: "daemon · 38 ticks",
    })
  })
})
```

- [ ] **Step 6: Run test — expect FAIL**

```bash
cd apps/app && yarn jest test/components/Inspector/selectors.test.ts -t "phoneChipState" 2>&1 | tail -8
```

Expected: `phoneChipState is not defined`

- [ ] **Step 7: Implement `phoneChipState`**

Append to `apps/app/app/components/Inspector/selectors.ts`:

```ts
export type PhoneInput = {
  daemonRunning: boolean
  lastTickAt: number | null
  daemonTicks: number
  nowMs: number
  appErrorsLast5min: number
}

const TICK_STALE_MS = 90_000

export function phoneChipState(i: PhoneInput): { dot: Dot; sub: string } {
  const sub = i.daemonRunning ? `daemon · ${i.daemonTicks} ticks` : "daemon stopped"
  if (i.appErrorsLast5min > 0) return { dot: "red", sub }
  if (!i.daemonRunning) return { dot: "amber", sub }
  if (i.lastTickAt != null && i.nowMs - i.lastTickAt > TICK_STALE_MS) {
    return { dot: "amber", sub }
  }
  return { dot: "green", sub }
}
```

- [ ] **Step 8: Run test — expect PASS**

```bash
cd apps/app && yarn jest test/components/Inspector/selectors.test.ts -t "phoneChipState" 2>&1 | tail -8
```

Expected: `4 passed`

- [ ] **Step 9: Write failing tests for `backendChipState`**

Append:

```ts
describe("backendChipState", () => {
  const base = {
    queueDepth: 0,
    queueDead: 0,
    lastSyncAt: 10_000_000,
    consecutiveApiFailures: 0,
    nowMs: 10_000_000,
  }
  test("clean → green / 'synced 0m ago'", () => {
    expect(backendChipState(base)).toEqual({ dot: "green", sub: "synced 0m ago" })
  })
  test("pending only → amber", () => {
    expect(backendChipState({ ...base, queueDepth: 3 })).toEqual({
      dot: "amber",
      sub: "3 pending · 0 dead",
    })
  })
  test("dead items → amber", () => {
    expect(backendChipState({ ...base, queueDead: 2 })).toEqual({
      dot: "amber",
      sub: "0 pending · 2 dead",
    })
  })
  test("2+ api failures → red", () => {
    expect(backendChipState({ ...base, consecutiveApiFailures: 2 })).toEqual({
      dot: "red",
      sub: "synced 0m ago",
    })
  })
  test("last sync > 1h → red", () => {
    expect(
      backendChipState({ ...base, lastSyncAt: 10_000_000 - 4_000_000 }),
    ).toEqual({ dot: "red", sub: "synced 66m ago" })
  })
})
```

- [ ] **Step 10: Run test — expect FAIL**

```bash
cd apps/app && yarn jest test/components/Inspector/selectors.test.ts -t "backendChipState" 2>&1 | tail -8
```

Expected: `backendChipState is not defined`

- [ ] **Step 11: Implement `backendChipState`**

Append:

```ts
export type BackendInput = {
  queueDepth: number
  queueDead: number
  lastSyncAt: number | null
  consecutiveApiFailures: number
  nowMs: number
}

const SYNC_STALE_AMBER_MS = 10 * 60_000
const SYNC_STALE_RED_MS = 60 * 60_000

export function backendChipState(i: BackendInput): { dot: Dot; sub: string } {
  const minsSinceSync =
    i.lastSyncAt != null ? Math.round((i.nowMs - i.lastSyncAt) / 60_000) : null
  const queueSub =
    i.queueDepth > 0 || i.queueDead > 0
      ? `${i.queueDepth} pending · ${i.queueDead} dead`
      : minsSinceSync != null
        ? `synced ${minsSinceSync}m ago`
        : "—"

  if (i.consecutiveApiFailures >= 2) return { dot: "red", sub: queueSub }
  if (i.lastSyncAt != null && i.nowMs - i.lastSyncAt > SYNC_STALE_RED_MS) {
    return { dot: "red", sub: queueSub }
  }
  if (i.queueDepth > 0 || i.queueDead > 0) return { dot: "amber", sub: queueSub }
  if (i.lastSyncAt != null && i.nowMs - i.lastSyncAt > SYNC_STALE_AMBER_MS) {
    return { dot: "amber", sub: queueSub }
  }
  return { dot: "green", sub: queueSub }
}
```

- [ ] **Step 12: Run test — expect PASS**

```bash
cd apps/app && yarn jest test/components/Inspector/selectors.test.ts -t "backendChipState" 2>&1 | tail -8
```

Expected: `5 passed`

- [ ] **Step 13: Write failing tests for `coverageChipState`**

Append:

```ts
describe("coverageChipState", () => {
  test("≥80% → green", () => {
    expect(coverageChipState({ percent: 85 })).toEqual({ color: "green", percent: 85 })
  })
  test("50–79% → amber", () => {
    expect(coverageChipState({ percent: 65 })).toEqual({ color: "amber", percent: 65 })
  })
  test("<50% → red", () => {
    expect(coverageChipState({ percent: 18 })).toEqual({ color: "red", percent: 18 })
  })
})
```

- [ ] **Step 14: Implement `coverageChipState` and verify tests pass**

Append:

```ts
export function coverageChipState(i: { percent: number }): {
  color: "green" | "amber" | "red"
  percent: number
} {
  const p = i.percent
  if (p >= 80) return { color: "green", percent: p }
  if (p >= 50) return { color: "amber", percent: p }
  return { color: "red", percent: p }
}
```

```bash
cd apps/app && yarn jest test/components/Inspector/selectors.test.ts 2>&1 | tail -10
```

Expected: All tests pass (18 total).

- [ ] **Step 15: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/selectors.ts apps/app/test/components/Inspector/selectors.test.ts && \
git commit -m "inspector: chip-state selectors with unit tests"
```

---

## Task 2: Chip primitive component

**Files:**
- Create: `apps/app/app/components/Inspector/Chip.tsx`

- [ ] **Step 1: Implement `Chip`**

```tsx
// apps/app/app/components/Inspector/Chip.tsx
import { FC } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

import type { Dot } from "./selectors"

type Props = {
  icon: PhosphorIcon
  name: string
  sub: string
  dot: Dot
  onPress?: () => void
}

export const Chip: FC<Props> = ({ icon: Icon, name, sub, dot, onPress }) => {
  const { colors } = LOCAL_THEME
  const dotColor =
    dot === "green" ? "#4ade80" : dot === "amber" ? "#fbbf24" : "#ef4444"
  const iconColor =
    dot === "green" ? "#86efac" : dot === "amber" ? "#fcd34d" : "#fca5a5"

  const Container: typeof TouchableOpacity | typeof View = onPress
    ? TouchableOpacity
    : View

  return (
    <Container
      onPress={onPress}
      style={[$wrap, { backgroundColor: colors.surfaceCard, borderColor: colors.surfaceCardBorder }]}
      activeOpacity={0.7}
    >
      <View style={[$dot, { backgroundColor: dotColor }]} />
      <Icon size={20} color={iconColor} weight="regular" />
      <Text text={name} size="xxs" style={[$name, { color: colors.textDim }]} />
      <Text text={sub} size="xxs" style={[$sub, { color: colors.textDim }]} numberOfLines={2} />
    </Container>
  )
}

const $wrap: ViewStyle = {
  flex: 1,
  borderRadius: 14,
  borderWidth: 1,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 3,
  minHeight: 92,
  position: "relative",
}

const $dot: ViewStyle = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 6,
  height: 6,
  borderRadius: 3,
}

const $name = { textTransform: "uppercase" as const, letterSpacing: 0.4, marginTop: 2 }
const $sub = { textAlign: "center" as const, fontSize: 9, lineHeight: 11 }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/Chip.tsx && \
git commit -m "inspector: Chip primitive (status dot + icon + sub-text)"
```

---

## Task 3: CoverageRingChip component

**Files:**
- Create: `apps/app/app/components/Inspector/CoverageRingChip.tsx`

- [ ] **Step 1: Implement `CoverageRingChip`**

```tsx
// apps/app/app/components/Inspector/CoverageRingChip.tsx
import { FC } from "react"
import { View, ViewStyle } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { coverageChipState } from "./selectors"

type Props = { percent: number }

const RADIUS = 17
const STROKE = 4
const CIRC = 2 * Math.PI * RADIUS

export const CoverageRingChip: FC<Props> = ({ percent }) => {
  const { colors } = LOCAL_THEME
  const state = coverageChipState({ percent })
  const strokeColor =
    state.color === "green" ? "#86efac" : state.color === "amber" ? "#fcd34d" : "#fca5a5"
  const dashOffset = CIRC - (CIRC * Math.min(100, Math.max(0, percent))) / 100

  return (
    <View
      style={[
        $wrap,
        { backgroundColor: colors.surfaceCard, borderColor: colors.surfaceCardBorder },
      ]}
    >
      <View style={$ringWrap}>
        <Svg width={42} height={42}>
          <Circle
            cx={21}
            cy={21}
            r={RADIUS}
            stroke="#1f1f1f"
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={21}
            cy={21}
            r={RADIUS}
            stroke={strokeColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC}`}
            strokeDashoffset={dashOffset}
            fill="none"
            transform="rotate(-90 21 21)"
          />
        </Svg>
        <Text text={`${Math.round(percent)}%`} size="xxs" weight="semiBold" style={$pct} />
      </View>
      <Text text="Coverage" size="xxs" style={[$name, { color: colors.textDim }]} />
    </View>
  )
}

const $wrap: ViewStyle = {
  flex: 1,
  borderRadius: 14,
  borderWidth: 1,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 3,
  minHeight: 92,
}
const $ringWrap: ViewStyle = { position: "relative", width: 42, height: 42 }
const $pct = {
  position: "absolute" as const,
  top: 12,
  left: 0,
  right: 0,
  textAlign: "center" as const,
}
const $name = { textTransform: "uppercase" as const, letterSpacing: 0.4, marginTop: 2 }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/CoverageRingChip.tsx && \
git commit -m "inspector: CoverageRingChip with colored ring + percent"
```

---

## Task 4: HealthStrip composition

**Files:**
- Create: `apps/app/app/components/Inspector/HealthStrip.tsx`

- [ ] **Step 1: Implement `HealthStrip`**

```tsx
// apps/app/app/components/Inspector/HealthStrip.tsx
import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { Bluetooth, Cloud, DeviceMobile } from "phosphor-react-native"

import { Chip } from "./Chip"
import { CoverageRingChip } from "./CoverageRingChip"
import {
  strapChipState,
  phoneChipState,
  backendChipState,
  type StrapInput,
  type PhoneInput,
  type BackendInput,
} from "./selectors"

type Props = {
  strap: StrapInput
  phone: PhoneInput
  backend: BackendInput
  coveragePercent: number
  onTapPhone?: () => void
}

export const HealthStrip: FC<Props> = ({
  strap,
  phone,
  backend,
  coveragePercent,
  onTapPhone,
}) => {
  const s = strapChipState(strap)
  const p = phoneChipState(phone)
  const b = backendChipState(backend)

  return (
    <View style={$row}>
      <Chip icon={Bluetooth} name="Strap" sub={s.sub} dot={s.dot} />
      <Chip icon={DeviceMobile} name="Phone" sub={p.sub} dot={p.dot} onPress={onTapPhone} />
      <Chip icon={Cloud} name="Backend" sub={b.sub} dot={b.dot} />
      <CoverageRingChip percent={coveragePercent} />
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", gap: 6, marginBottom: 14 }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/HealthStrip.tsx && \
git commit -m "inspector: HealthStrip composes 4 chips from typed inputs"
```

---

## Task 5: EventsCard (merged alerts + activity)

**Files:**
- Create: `apps/app/app/components/Inspector/EventsCard.tsx`
- Create: `apps/app/test/components/Inspector/buildEvents.test.ts`

- [ ] **Step 1: Write failing test for `buildEvents` ordering**

```ts
// apps/app/test/components/Inspector/buildEvents.test.ts
import { buildEvents } from "@/components/Inspector/EventsCard"

describe("buildEvents", () => {
  test("warn rows precede ok rows, both newest first, capped at 10", () => {
    const events = buildEvents({
      apiFailures: [
        { at: 100, endpoint: "POST /a", kind: "timeout" },
        { at: 50, endpoint: "POST /b", kind: "http_500" },
      ],
      detectedGaps: [{ detectedAt: 80, fromMs: 0, toMs: 8_940_000, durationMinutes: 149 }],
      syncSessions: [
        { startedAt: 90, durationMs: 1000, recordsPulled: 72, iterations: 2, stopReason: "caught_up" },
      ],
      lastPipelineRunAt: 70,
      lastPipelineDurationMs: 1_078_000,
      daemonRunning: false,
      lastTickAt: 60,
      nowMs: 1000,
    })
    expect(events.map((e) => e.tone)).toEqual(["warn", "warn", "warn", "ok", "ok"])
    expect(events[0].title).toContain("POST /a")
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/app && yarn jest test/components/Inspector/buildEvents.test.ts 2>&1 | tail -8
```

- [ ] **Step 3: Implement `buildEvents` + render `EventsCard`**

```tsx
// apps/app/app/components/Inspector/EventsCard.tsx
import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { Check, Clock, Pulse, Warning } from "phosphor-react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import type {
  ApiFailureRecord,
  DetectedGap,
  SyncSession,
} from "@/services/sync/syncTelemetry"

export type EventRow = {
  id: string
  tone: "warn" | "bad" | "ok"
  icon: PhosphorIcon
  title: string
  sub: string
  at: number
}

type BuildInput = {
  apiFailures: ApiFailureRecord[]
  detectedGaps: DetectedGap[]
  syncSessions: SyncSession[]
  lastPipelineRunAt: number | null
  lastPipelineDurationMs: number | null
  daemonRunning: boolean
  lastTickAt: number | null
  nowMs: number
}

const TICK_AGE_FOR_WARN_MS = 5 * 60_000
const MAX = 10

export function buildEvents(i: BuildInput): EventRow[] {
  const out: EventRow[] = []
  for (const f of i.apiFailures) {
    out.push({
      id: `api-${f.at}-${f.endpoint}`,
      tone: "warn",
      icon: Warning,
      title: `API · ${f.endpoint}`,
      sub: `${f.kind} · ${Math.round((i.nowMs - f.at) / 1000)}s ago`,
      at: f.at,
    })
  }
  if (!i.daemonRunning && i.lastTickAt != null && i.nowMs - i.lastTickAt > TICK_AGE_FOR_WARN_MS) {
    out.push({
      id: `daemon-stopped-${i.lastTickAt}`,
      tone: "warn",
      icon: Pulse,
      title: "Daemon stopped",
      sub: `last tick ${Math.round((i.nowMs - i.lastTickAt) / 60_000)}m ago`,
      at: i.lastTickAt,
    })
  }
  for (const g of i.detectedGaps) {
    out.push({
      id: `gap-${g.fromMs}`,
      tone: "warn",
      icon: Clock,
      title: `${g.durationMinutes.toFixed(0)}-min gap`,
      sub: formatGapWindow(g.fromMs, g.toMs),
      at: g.detectedAt,
    })
  }
  for (const s of i.syncSessions) {
    out.push({
      id: `sync-${s.startedAt}`,
      tone: "ok",
      icon: Check,
      title: `Sync · ${s.recordsPulled} rec · ${s.stopReason}`,
      sub: `${formatAgo(i.nowMs - s.startedAt)} · ${(s.durationMs / 1000).toFixed(1)}s · ${s.iterations} pass`,
      at: s.startedAt,
    })
  }
  if (i.lastPipelineRunAt != null && i.lastPipelineDurationMs != null) {
    out.push({
      id: `pipeline-${i.lastPipelineRunAt}`,
      tone: "ok",
      icon: Check,
      title: "Pipeline",
      sub: `${formatAgo(i.nowMs - i.lastPipelineRunAt)} · ${(i.lastPipelineDurationMs / 1000).toFixed(0)}s`,
      at: i.lastPipelineRunAt,
    })
  }
  out.sort((a, b) => {
    const toneRank = (t: EventRow["tone"]) => (t === "bad" ? 0 : t === "warn" ? 1 : 2)
    const r = toneRank(a.tone) - toneRank(b.tone)
    return r !== 0 ? r : b.at - a.at
  })
  return out.slice(0, MAX)
}

function formatAgo(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  return `${(ms / 3_600_000).toFixed(1)}h ago`
}

function formatGapWindow(fromMs: number, toMs: number): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${fmt(fromMs)} → ${fmt(toMs)}`
}

export const EventsCard: FC<{ events: EventRow[] }> = ({ events }) => {
  const { colors } = LOCAL_THEME
  if (events.length === 0) {
    return (
      <View style={[$card, { borderColor: colors.surfaceCardBorder, backgroundColor: colors.surfaceCard }]}>
        <Text text="No events" size="xs" style={{ color: colors.textDim }} />
      </View>
    )
  }
  return (
    <View style={[$card, { borderColor: colors.surfaceCardBorder, backgroundColor: colors.surfaceCard }]}>
      {events.map((e, i) => {
        const Icon = e.icon
        const titleColor =
          e.tone === "warn" ? "#fbbf24" : e.tone === "bad" ? "#ef4444" : colors.text
        return (
          <View
            key={e.id}
            style={[
              $row,
              i > 0 ? { borderTopWidth: 1, borderTopColor: colors.surfaceCardBorder } : null,
            ]}
          >
            <Icon size={14} color={titleColor} weight="regular" />
            <View style={{ flex: 1 }}>
              <Text text={e.title} size="xs" weight="semiBold" style={{ color: titleColor }} />
              <Text text={e.sub} size="xxs" style={{ color: colors.textDim, marginTop: 1 }} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

const $card: ViewStyle = { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 }
const $row: ViewStyle = {
  flexDirection: "row",
  gap: 10,
  paddingVertical: 8,
  alignItems: "flex-start",
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/app && yarn jest test/components/Inspector/buildEvents.test.ts 2>&1 | tail -6
```

Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/EventsCard.tsx apps/app/test/components/Inspector/buildEvents.test.ts && \
git commit -m "inspector: EventsCard merges alerts + activity, warn-first ordering"
```

---

## Task 6: DaemonDrilldown

**Files:**
- Create: `apps/app/app/components/Inspector/DaemonDrilldown.tsx`

- [ ] **Step 1: Implement `DaemonDrilldown`**

```tsx
// apps/app/app/components/Inspector/DaemonDrilldown.tsx
import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  visible: boolean
  ticks: number
  skippedBusy: number
  skippedDisconnected: number
  intervalMs: number
  running: boolean
}

export const DaemonDrilldown: FC<Props> = ({
  visible,
  ticks,
  skippedBusy,
  skippedDisconnected,
  intervalMs,
  running,
}) => {
  const { colors } = LOCAL_THEME
  if (!visible) return null
  return (
    <View
      style={[
        $wrap,
        { backgroundColor: colors.surfaceCardElevated ?? "#0a0a0a", borderColor: colors.surfaceCardBorder },
      ]}
    >
      <Stat label={running ? "ticks" : "ticks (last run)"} value={String(ticks)} />
      <Stat label="skip busy" value={String(skippedBusy)} />
      <Stat label="skip disc." value={String(skippedDisconnected)} />
      <Stat label="interval" value={`${Math.round(intervalMs / 1000)}s`} />
    </View>
  )
}

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text text={value} size="sm" weight="semiBold" style={{ color: colors.text }} />
      <Text text={label} size="xxs" style={{ color: colors.textDim, textTransform: "uppercase" }} />
    </View>
  )
}

const $wrap: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingHorizontal: 10,
  paddingVertical: 8,
  marginTop: 6,
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: "dashed",
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/DaemonDrilldown.tsx && \
git commit -m "inspector: DaemonDrilldown shows ticks/skipped/interval stats"
```

---

## Task 7: LogsCard adds Copy, switches to icon-only

**Files:**
- Modify: `apps/app/app/components/Inspector/LogsCard.tsx`

- [ ] **Step 1: Add `expo-clipboard` if not present**

```bash
cd apps/app && cat package.json | grep -q "expo-clipboard" || npx expo install expo-clipboard
```

- [ ] **Step 2: Verify install**

```bash
ls /Users/nish/Documents/noop/node_modules/expo-clipboard/ | head -3
```

Expected: `android  build  ios` (or similar — directory exists).

- [ ] **Step 3: Read current `LogsCard.tsx` to know exact line locations**

```bash
cat /Users/nish/Documents/noop/apps/app/app/components/Inspector/LogsCard.tsx
```

Note the existing Export button block and import lines.

- [ ] **Step 4: Replace `LogsCard.tsx` with Copy + Export icon-only header**

Replace the entire file contents with:

```tsx
// apps/app/app/components/Inspector/LogsCard.tsx
import { FC, useCallback, useEffect, useState } from "react"
import { ScrollView, TouchableOpacity, View, ViewStyle } from "react-native"
import { Copy as CopyIcon, Export as ExportIcon } from "phosphor-react-native"
import * as Clipboard from "expo-clipboard"
import * as Sharing from "expo-sharing"

import { Text } from "@/components/Text"
import {
  getTodayLogPath,
  readRecentLogLines,
} from "@/services/observability/persistentLog"
import { LOCAL_THEME } from "@/utils/localTheme"

import { InspectorCard } from "./InspectorCard"
import { StatusPill } from "./StatusPill"

export const LogsCard: FC = () => {
  const { colors } = LOCAL_THEME
  const [lines, setLines] = useState<string[]>([])
  const [busyKind, setBusyKind] = useState<"copy" | "export" | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const tail = await readRecentLogLines(100)
      setLines(tail)
    } catch (err) {
      console.warn("[LogsCard] read failed", err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 3_000)
    return () => clearInterval(id)
  }, [refresh])

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1500)
  }

  const onCopy = useCallback(async () => {
    setBusyKind("copy")
    try {
      await Clipboard.setStringAsync(lines.join("\n"))
      flashToast("Copied")
    } catch (err) {
      console.warn("[LogsCard] copy failed", err)
      flashToast("Couldn't copy")
    } finally {
      setBusyKind(null)
    }
  }, [lines])

  const onExport = useCallback(async () => {
    setBusyKind("export")
    try {
      const path = await getTodayLogPath()
      if (!path) return
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        flashToast("Sharing unavailable")
        return
      }
      await Sharing.shareAsync(path, {
        UTI: "public.plain-text",
        mimeType: "text/plain",
        dialogTitle: "Export noop log",
      })
    } catch (err) {
      console.warn("[LogsCard] export failed", err)
      flashToast("Couldn't export")
    } finally {
      setBusyKind(null)
    }
  }, [])

  return (
    <InspectorCard
      title="Logs"
      pill={<StatusPill tone="dim" text={`${lines.length} lines`} />}
      defaultExpanded={false}
    >
      <View style={$header}>
        <Text text={toast ?? "Today's persistent log · 7-day retention"} size="xxs" style={{ color: colors.textDim }} />
        <View style={$btnRow}>
          <TouchableOpacity
            onPress={onCopy}
            disabled={busyKind != null || lines.length === 0}
            style={[$iconBtn, { backgroundColor: colors.surfaceElevated }]}
            accessibilityLabel="Copy logs"
          >
            <CopyIcon size={13} color={colors.text} weight="regular" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onExport}
            disabled={busyKind != null || lines.length === 0}
            style={[$iconBtn, { backgroundColor: colors.surfaceElevated }]}
            accessibilityLabel="Export logs"
          >
            <ExportIcon size={13} color={colors.text} weight="regular" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={$scroller} nestedScrollEnabled>
        {lines.length === 0 ? (
          <Text text="No entries yet" size="xs" style={{ color: colors.textDim, padding: 8 }} />
        ) : (
          lines.map((line, idx) => (
            <Text
              key={idx}
              text={line}
              size="xxs"
              style={{
                color: colorForLine(line, colors),
                fontVariant: ["tabular-nums"],
                fontFamily: "Menlo",
                paddingVertical: 2,
                paddingHorizontal: 6,
              }}
            />
          ))
        )}
      </ScrollView>
    </InspectorCard>
  )
}

function colorForLine(line: string, colors: typeof LOCAL_THEME.colors): string {
  if (line.includes(" ERROR ")) return colors.statusRed
  if (line.includes(" WARN ")) return colors.statusAmber
  return colors.text
}

const $header: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingBottom: 8,
  gap: 8,
}
const $btnRow: ViewStyle = { flexDirection: "row", gap: 6 }
const $iconBtn: ViewStyle = {
  width: 26,
  height: 26,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
}
const $scroller: ViewStyle = { maxHeight: 280 }
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/nish/Documents/noop/apps/app && yarn compile 2>&1 | tail -10
```

Expected: no new errors in `LogsCard.tsx`.

- [ ] **Step 6: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/LogsCard.tsx apps/app/package.json apps/app/ios/Podfile.lock && \
git commit -m "inspector: Logs Copy button + icon-only header buttons"
```

---

## Task 8: SyncProgressCard anti-flicker damp

**Files:**
- Modify: `apps/app/app/components/Inspector/SyncProgressCard.tsx`

- [ ] **Step 1: Read current implementation**

```bash
sed -n '1,80p' /Users/nish/Documents/noop/apps/app/app/components/Inspector/SyncProgressCard.tsx
```

- [ ] **Step 2: Add 500ms damp on pass transitions**

In the same file, locate the state subscription that updates `currentPass` and `recordsThisPass`. Wrap the update so that when `pass` changes, we delay the visual update by 500 ms:

```tsx
// at the top of the component body (existing component)
const [visiblePass, setVisiblePass] = useState(currentPass)
const [visibleRecords, setVisibleRecords] = useState(recordsThisPass)

useEffect(() => {
  if (currentPass === visiblePass) {
    setVisibleRecords(recordsThisPass)
    return
  }
  const t = setTimeout(() => {
    setVisiblePass(currentPass)
    setVisibleRecords(recordsThisPass)
  }, 500)
  return () => clearTimeout(t)
}, [currentPass, recordsThisPass, visiblePass])
```

Then use `visiblePass` / `visibleRecords` in the rendered JSX in place of the raw values.

- [ ] **Step 3: Type-check**

```bash
cd /Users/nish/Documents/noop/apps/app && yarn compile 2>&1 | tail -5
```

Expected: no errors in SyncProgressCard.tsx.

- [ ] **Step 4: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/SyncProgressCard.tsx && \
git commit -m "inspector: damp 500ms between pass transitions to avoid flicker"
```

---

## Task 9: ActionsRow component

**Files:**
- Create: `apps/app/app/components/Inspector/ActionsRow.tsx`

- [ ] **Step 1: Implement `ActionsRow`**

```tsx
// apps/app/app/components/Inspector/ActionsRow.tsx
import { FC } from "react"
import { Alert, TouchableOpacity, View, ViewStyle } from "react-native"
import {
  ArrowsLeftRight,
  ArrowClockwise,
  Broom,
  Cloud,
} from "phosphor-react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  isSyncing: boolean
  queueDepth: number
  onSync: () => void | Promise<void>
  onRefresh: () => void | Promise<void>
  onClearQueue: () => void | Promise<void>
  onForceUpload: () => void | Promise<void>
}

export const ActionsRow: FC<Props> = ({
  isSyncing,
  queueDepth,
  onSync,
  onRefresh,
  onClearQueue,
  onForceUpload,
}) => {
  const confirmAndClear = () => {
    Alert.alert(
      "Clear outbound queue?",
      `This deletes ${queueDepth} pending uploads. Cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => void onClearQueue() },
      ],
    )
  }

  return (
    <View style={$row}>
      <ActBtn icon={ArrowsLeftRight} label={isSyncing ? "Syncing" : "Sync"} disabled={isSyncing} onPress={onSync} />
      <ActBtn icon={ArrowClockwise} label="Refresh" onPress={onRefresh} />
      <ActBtn icon={Broom} label="Clear" onPress={confirmAndClear} />
      <ActBtn icon={Cloud} label="Upload" onPress={onForceUpload} />
    </View>
  )
}

const ActBtn: FC<{
  icon: PhosphorIcon
  label: string
  disabled?: boolean
  onPress: () => void | Promise<void>
}> = ({ icon: Icon, label, disabled, onPress }) => {
  const { colors } = LOCAL_THEME
  return (
    <TouchableOpacity
      style={[
        $btn,
        { backgroundColor: colors.surfaceElevated },
        disabled ? { opacity: 0.4 } : null,
      ]}
      disabled={disabled}
      onPress={() => void onPress()}
      activeOpacity={0.7}
    >
      <Icon size={18} color={colors.text} weight="regular" />
      <Text text={label} size="xxs" style={{ color: colors.text }} />
    </TouchableOpacity>
  )
}

const $row: ViewStyle = { flexDirection: "row", gap: 6 }
const $btn: ViewStyle = {
  flex: 1,
  borderRadius: 12,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 4,
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/ActionsRow.tsx && \
git commit -m "inspector: ActionsRow with 4 default actions + clear confirm"
```

---

## Task 10: ExpertActions component

**Files:**
- Create: `apps/app/app/components/Inspector/ExpertActions.tsx`

- [ ] **Step 1: Implement `ExpertActions`**

```tsx
// apps/app/app/components/Inspector/ExpertActions.tsx
import { FC } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"
import {
  Bug,
  Database,
  Power,
  Wrench,
} from "phosphor-react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Handler = () => void | Promise<void>

type Props = {
  onProbeRange: Handler
  onRunPipeline: Handler
  onOpenWebInspector: Handler
  onRewindTs: Handler
  onRewindAck: Handler
  onRewindBare: Handler
  onWhoopsiInit: Handler
  onForceTrimLegacy: Handler
  onForceTrimMaverick: Handler
  onRebootStrap: Handler
  onPowerCycleStrap: Handler
}

export const ExpertActions: FC<Props> = (h) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <Group label="Diagnostics" labelColor="#fbbf24">
        <Btn icon={Bug} label="Probe range" onPress={h.onProbeRange} />
        <Btn icon={Database} label="Run pipeline" onPress={h.onRunPipeline} />
        <Btn icon={Bug} label="Web inspector" onPress={h.onOpenWebInspector} />
      </Group>

      <Group label="Firmware probes" labelColor="#fbbf24">
        <Btn icon={Wrench} label="Rewind ts (4B)" onPress={h.onRewindTs} />
        <Btn icon={Wrench} label="Rewind ack (9B)" onPress={h.onRewindAck} />
        <Btn icon={Wrench} label="Rewind bare" onPress={h.onRewindBare} />
        <Btn icon={Wrench} label="WHOOPSI init" onPress={h.onWhoopsiInit} />
      </Group>

      <Group label="Danger" labelColor="#fca5a5">
        <Btn icon={Wrench} label="Force trim legacy" danger onPress={h.onForceTrimLegacy} />
        <Btn icon={Wrench} label="Force trim mvk" danger onPress={h.onForceTrimMaverick} />
        <Btn icon={Power} label="Reboot strap" danger onPress={h.onRebootStrap} />
        <Btn icon={Power} label="Power-cycle" danger onPress={h.onPowerCycleStrap} />
      </Group>
    </View>
  )
}

const Group: FC<{ label: string; labelColor: string; children: React.ReactNode }> = ({
  label,
  labelColor,
  children,
}) => (
  <View>
    <Text
      text={label}
      size="xxs"
      weight="semiBold"
      style={{ color: labelColor, textTransform: "uppercase", letterSpacing: 0.7, paddingHorizontal: 6, paddingBottom: 4 }}
    />
    <View style={$grid}>{children}</View>
  </View>
)

const Btn: FC<{
  icon: PhosphorIcon
  label: string
  danger?: boolean
  onPress: Handler
}> = ({ icon: Icon, label, danger, onPress }) => {
  const { colors } = LOCAL_THEME
  return (
    <TouchableOpacity
      style={[
        $btn,
        danger
          ? { backgroundColor: "#2a1a1a", borderColor: "#3a1a1a", borderWidth: 1 }
          : { backgroundColor: colors.surfaceElevated },
      ]}
      onPress={() => void onPress()}
      activeOpacity={0.7}
    >
      <Icon size={16} color={danger ? "#fca5a5" : colors.text} weight="regular" />
      <Text text={label} size="xxs" style={{ color: danger ? "#fca5a5" : colors.text, textAlign: "center" }} />
    </TouchableOpacity>
  )
}

const $grid: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $btn: ViewStyle = {
  width: "48.5%" as unknown as number,
  borderRadius: 12,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 4,
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/ExpertActions.tsx && \
git commit -m "inspector: ExpertActions with 3 grouped sections incl. Danger"
```

---

## Task 11: Expert-mode toggle hook

**Files:**
- Create: `apps/app/app/components/Inspector/useExpertMode.ts`

- [ ] **Step 1: Implement hook**

```ts
// apps/app/app/components/Inspector/useExpertMode.ts
import { useCallback, useState } from "react"

export function useExpertMode() {
  const [expert, setExpert] = useState(false)
  const handleLongPress = useCallback(() => {
    setExpert((v) => !v)
  }, [])
  return { expert, handleLongPress }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add apps/app/app/components/Inspector/useExpertMode.ts && \
git commit -m "inspector: useExpertMode hook (toggle via long-press, resets on remount)"
```

---

## Task 12: Re-orchestrate DebugInspectorScreen

**Files:**
- Modify: `apps/app/app/screens/DebugInspectorScreen.tsx`
- Delete: `apps/app/app/components/Inspector/LiveMonitorCard.tsx`
- Delete: `apps/app/app/components/Inspector/DiagnosticsCard.tsx`
- Delete: `apps/app/app/components/Inspector/ActionsCard.tsx`

- [ ] **Step 1: Identify what to keep vs delete in `DebugInspectorScreen`**

```bash
sed -n '1,60p' /Users/nish/Documents/noop/apps/app/app/screens/DebugInspectorScreen.tsx
sed -n '420,486p' /Users/nish/Documents/noop/apps/app/app/screens/DebugInspectorScreen.tsx
```

Note imports and the JSX block where `<LiveMonitorCard>`, `<DiagnosticsCard>`, `<ActionsCard>` are rendered.

- [ ] **Step 2: Replace render block**

Replace the JSX section that currently reads:

```tsx
<LiveMonitorCard overview={overview} />
<SyncProgressCard />
<DiagnosticsCard overview={overview} lastPipelineRun={lastPipelineRun} />
<LogsCard />
<ActionsCard ... lots of handler props ... />
```

with:

```tsx
<TouchableOpacity activeOpacity={1} onLongPress={handleLongPress} delayLongPress={600}>
  <View style={{ paddingHorizontal: 4 }}>
    <Text text="Inspector" size="xl" weight="bold" style={{ color: expert ? "#fbbf24" : colors.text }} />
    {expert ? (
      <Text text="EXPERT" size="xxs" style={{ color: "#fbbf24", paddingTop: 2 }} />
    ) : (
      <Text text="long-press for expert" size="xxs" style={{ color: colors.iconDim, paddingTop: 2 }} />
    )}
  </View>
</TouchableOpacity>

<HealthStrip
  strap={{
    connectionState: ble.connectionState,
    isWorn: ble.isWorn,
    batteryLevel: ble.batteryLevel,
    lastStreamAt: ble.lastStreamAt,
    backlogChunks: overview.backlogChunks ?? 0,
    nowMs,
  }}
  phone={{
    daemonRunning: daemonStats.isRunning,
    lastTickAt: daemonStats.lastTickAt,
    daemonTicks: daemonStats.ticks,
    nowMs,
    appErrorsLast5min: 0,
  }}
  backend={{
    queueDepth: queueStats.depth ?? 0,
    queueDead: queueStats.deadCount ?? 0,
    lastSyncAt: overview.lastSyncAt,
    consecutiveApiFailures: telemetry.apiFailures.slice(0, 2).length === 2 ? 2 : 0,
    nowMs,
  }}
  coveragePercent={overview.todayCoveragePercent ?? 0}
  onTapPhone={() => setDrilldownOpen((v) => !v)}
/>

{ble.isSyncing ? <SyncProgressCard /> : null}

<EventsCard
  events={buildEvents({
    apiFailures: telemetry.apiFailures,
    detectedGaps: telemetry.detectedGaps,
    syncSessions: telemetry.syncSessions,
    lastPipelineRunAt: telemetry.lastPipelineRunAt,
    lastPipelineDurationMs: telemetry.lastPipelineDurationMs,
    daemonRunning: daemonStats.isRunning,
    lastTickAt: daemonStats.lastTickAt,
    nowMs,
  })}
/>

<DaemonDrilldown
  visible={drilldownOpen}
  ticks={daemonStats.ticks}
  skippedBusy={daemonStats.skippedBusy}
  skippedDisconnected={daemonStats.skippedDisconnected}
  intervalMs={30_000}
  running={daemonStats.isRunning}
/>

<LogsCard />

<ActionsRow
  isSyncing={ble.isSyncing}
  queueDepth={queueStats.depth ?? 0}
  onSync={() => void syncNow()}
  onRefresh={() => void refreshInspector()}
  onClearQueue={handleClearQueue}
  onForceUpload={handleForceUpload}
/>

{expert ? (
  <ExpertActions
    onProbeRange={handleProbeDataRange}
    onRunPipeline={handleRunPipeline}
    onOpenWebInspector={handleOpenWebInspector}
    onRewindTs={() => void rewindAndResync("ts")}
    onRewindAck={() => void rewindAndResync("ack")}
    onRewindBare={() => void rewindAndResync("bare")}
    onWhoopsiInit={() => void whoopsiInitThenForceTrim()}
    onForceTrimLegacy={() => void forceTrimRewindAndSync("legacy")}
    onForceTrimMaverick={() => void forceTrimRewindAndSync("maverick")}
    onRebootStrap={() => void rebootStrap()}
    onPowerCycleStrap={() => void powerCycleStrap()}
  />
) : null}
```

Required new imports at the top of `DebugInspectorScreen.tsx`:

```tsx
import { TouchableOpacity, View } from "react-native"
import { HealthStrip } from "@/components/Inspector/HealthStrip"
import { EventsCard, buildEvents } from "@/components/Inspector/EventsCard"
import { DaemonDrilldown } from "@/components/Inspector/DaemonDrilldown"
import { ActionsRow } from "@/components/Inspector/ActionsRow"
import { ExpertActions } from "@/components/Inspector/ExpertActions"
import { useExpertMode } from "@/components/Inspector/useExpertMode"
import { getContinuousSyncStats } from "@/services/sync/continuousSyncDaemon"
```

Required new state at the top of the component:

```tsx
const { expert, handleLongPress } = useExpertMode()
const [drilldownOpen, setDrilldownOpen] = useState(false)
const [nowMs, setNowMs] = useState(Date.now())
const [daemonStats, setDaemonStats] = useState(getContinuousSyncStats)

useEffect(() => {
  const id = setInterval(() => {
    setNowMs(Date.now())
    setDaemonStats(getContinuousSyncStats())
  }, 1000)
  return () => clearInterval(id)
}, [])
```

Remove `<LiveMonitorCard>`, `<DiagnosticsCard>`, `<ActionsCard>` imports and their old JSX usages.

- [ ] **Step 3: Type-check**

```bash
cd /Users/nish/Documents/noop/apps/app && yarn compile 2>&1 | tail -20
```

Expected: zero errors. If errors mention missing fields on `ble` or `overview`, inspect the existing data and adjust the prop wiring (use the same selectors `LiveMonitorCard.tsx` was using before deletion).

- [ ] **Step 4: Delete obsolete card files**

```bash
cd /Users/nish/Documents/noop && \
rm apps/app/app/components/Inspector/LiveMonitorCard.tsx && \
rm apps/app/app/components/Inspector/DiagnosticsCard.tsx && \
rm apps/app/app/components/Inspector/ActionsCard.tsx
```

- [ ] **Step 5: Type-check again to surface stray imports**

```bash
cd /Users/nish/Documents/noop/apps/app && yarn compile 2>&1 | tail -20
```

If anything still imports the deleted files, remove those imports/usages.

- [ ] **Step 6: Run the full unit-test suite**

```bash
cd /Users/nish/Documents/noop/apps/app && yarn jest 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/nish/Documents/noop && \
git add -A && \
git commit -m "inspector: rewire DebugInspectorScreen to new components; delete old cards

- HealthStrip, EventsCard, DaemonDrilldown, ActionsRow, ExpertActions wired
- Long-press header toggles expert mode (state, not persisted)
- LiveMonitorCard, DiagnosticsCard, ActionsCard deleted"
```

---

## Task 13: Device smoke test

**Files:** none modified; runtime verification.

- [ ] **Step 1: Build Release for iOS device**

```bash
cd /Users/nish/Documents/noop/apps/app/ios && \
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -workspace noop.xcworkspace \
  -scheme noop \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /Users/nish/Library/Developer/Xcode/DerivedData/noop-byusgahfsjnrnrdxwbppjszytctr \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=LGMF2TG7P6 \
  CODE_SIGN_STYLE=Automatic \
  build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 2: Install to iPhone 17 Pro**

```bash
xcrun devicectl device install app \
  --device 4B27EABA-A761-5810-993E-D4909BC3B6E3 \
  /Users/nish/Library/Developer/Xcode/DerivedData/noop-byusgahfsjnrnrdxwbppjszytctr/Build/Products/Release-iphoneos/noop.app 2>&1 | tail -5
```

Expected: `App installed:` with a new bundle UUID.

- [ ] **Step 3: Open Inspector tab on the device and verify by checklist**

Walk through these checks. For each, confirm visually. If any fails, capture a log via the new Logs Copy button and report.

- Health strip shows 4 chips: Strap, Phone, Backend, Coverage ring.
- Strap chip: dot green when connected and ready; sub-text "on wrist · NN%" or "off wrist · NN%".
- Disconnect BLE (toggle airplane mode briefly): Strap dot turns red within ~2s, sub-text "—".
- Reconnect: Strap dot returns to green.
- Phone chip while daemon running: dot green, sub "daemon · N ticks". Tap → DaemonDrilldown reveals 4 stats.
- Backend chip with empty queue: dot green, sub "synced Nm ago".
- Coverage chip ring fills proportionally; percent inside.
- Events card shows recent syncs as OK rows, warns above OKs.
- Tap *Sync* → SyncProgressCard renders, completes, disappears.
- Tap *Refresh* → no error.
- Tap *Clear* → confirm alert appears.
- Tap *Upload* → no error.
- Logs card expand → Copy button copies to clipboard (paste in Notes app to verify); Export opens iOS share sheet.
- Long-press *Inspector* header (≥600ms) → header turns amber, "EXPERT" badge, three grouped sections appear below.
- Long-press again → expert mode collapses.
- Force-close app and relaunch → expert mode is back to default (off).

- [ ] **Step 4: Document any deviations**

If any check failed, write a note in the PR/branch description with the chip + observed behavior, and either fix here or open a follow-up task.

- [ ] **Step 5: Commit any small fixes from smoke test**

```bash
cd /Users/nish/Documents/noop && git status
# If there are fixes:
git add -A && git commit -m "inspector: smoke-test polish (describe specific fix)"
```

---

## Self-review notes

- All 8 spec gaps addressed: API failures (Task 5), queue (Task 12 wiring), battery (Task 1 + 12), SyncProgressCard (Task 8 + conditional render in Task 12), daemon drilldown (Task 6 + 12), connection states (Task 1), strap silent (Task 1), expert mode (Task 10 + 11 + 12).
- Selectors are pure functions, unit-tested independently (Task 1).
- Cleanup of old cards in Task 12 (delete after re-orchestration so type-checker can surface stragglers).
- Frequent commits — 13 commits across 13 tasks.
- No placeholders: every code step shows the actual code; every test step shows actual test code.

