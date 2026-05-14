# Inspector Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `DebugInspectorScreen` to a 4th bottom tab and replace its layout with three collapsible cards (Live Monitor, Diagnostics, Actions) using minimal pill-style design with smart-default expand rules.

**Architecture:** A reusable `InspectorCard` primitive renders header + optional pill + collapsible body. Three feature cards (`LiveMonitorCard`, `DiagnosticsCard`, `ActionsCard`) sit inside `DebugInspectorScreen`, which owns shared state and data fetching. Backend `/debug/overview` gains three fields (`latestSignalSampleAt`, `recentNights`, `todayCoverageMinutes`) to power the new content without extra round-trips.

**Tech Stack:** React Native (Expo), TypeScript, `@react-navigation/bottom-tabs`, NestJS + TypeORM (backend), `@expo/vector-icons` Ionicons.

**Reference spec:** `docs/superpowers/specs/2026-05-14-inspector-tab-design.md`

---

## File Map

**Backend — modify:**
- `apps/backend/src/debug/debug.service.ts` — extend `getOverview()` return type with three fields
- `apps/backend/test/debug.service.spec.ts` — add tests for new fields (create if missing)

**Frontend — create:**
- `apps/app/app/components/Inspector/InspectorCard.tsx` — collapsible card primitive
- `apps/app/app/components/Inspector/StatusPill.tsx` — pill component (ok/warn/bad/dim variants)
- `apps/app/app/components/Inspector/CoverageBar.tsx` — horizontal coverage segments
- `apps/app/app/components/Inspector/LiveMonitorCard.tsx` — Live Monitor card
- `apps/app/app/components/Inspector/DiagnosticsCard.tsx` — Diagnostics card
- `apps/app/app/components/Inspector/ActionsCard.tsx` — Actions card

**Frontend — modify:**
- `apps/app/app/services/api/noopClient.ts` — extend `DebugOverview` interface
- `apps/app/app/screens/DebugInspectorScreen.tsx` — refactor to compose the three cards
- `apps/app/app/navigators/MainNavigator.tsx` — add `Inspector` tab + icon config
- `apps/app/app/screens/DeviceSettingsScreen.tsx` — remove Diagnostics link, add Log Out row

---

## Task 1: Enrich backend `/debug/overview`

**Files:**
- Modify: `apps/backend/src/debug/debug.service.ts:getOverview`
- Test: `apps/backend/test/debug.service.spec.ts` (create or extend)

- [ ] **Step 1: Read existing `getOverview` to find where to splice in new fields**

```bash
grep -n "async getOverview\b\|latestRawTimestamp\|return {" apps/backend/src/debug/debug.service.ts | head -20
```

Note the exact return-object shape and the variables already in scope (timezone, selectedKey, selectedDate, etc.).

- [ ] **Step 2: Write failing test**

Create `apps/backend/test/debug.service.spec.ts` (or extend if it exists):

```typescript
import { Test } from '@nestjs/testing';
import { DebugService } from '../src/debug/debug.service';
// (mirror the existing test bootstrap; if no spec exists yet, copy
// the harness pattern from another *.service.spec.ts in apps/backend/test)

describe('DebugService.getOverview enrichment', () => {
  let service: DebugService;
  // ...standard NestJS test module setup with TypeORM in-memory repos...

  it('returns latestSignalSampleAt from most recent signal_samples row', async () => {
    // seed: one signal_sample at 2026-05-13T18:00:00Z for userId 'u1'
    const result = await service.getOverview('u1', '2026-05-14', 'UTC');
    expect(result.latestSignalSampleAt).toBe('2026-05-13T18:00:00.000Z');
  });

  it('returns recentNights for the 3 nights prior to selectedDate', async () => {
    // seed: detections on 2026-05-11 and 2026-05-09; no detection 2026-05-12, 5-13
    const result = await service.getOverview('u1', '2026-05-14', 'UTC');
    expect(result.recentNights).toEqual([
      { nightDate: '2026-05-13', hasDetection: false, rawRecordCount: 80 },
      { nightDate: '2026-05-12', hasDetection: false, rawRecordCount: 0 },
      { nightDate: '2026-05-11', hasDetection: true, rawRecordCount: 10311 },
    ]);
  });

  it('returns todayCoverageMinutes = count of distinct UTC minute-buckets with ≥1 record today', async () => {
    // seed: 80 records all within a 22-minute window on selectedDate
    const result = await service.getOverview('u1', '2026-05-14', 'UTC');
    expect(result.todayCoverageMinutes).toBe(22);
  });
});
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
cd apps/backend && pnpm test -- debug.service.spec
```

Expected: 3 failures — fields don't exist on result yet.

- [ ] **Step 4: Add fields to `getOverview` return**

In `apps/backend/src/debug/debug.service.ts`, inside `getOverview`, before the final `return {…}`:

```typescript
// Newest signal_sample timestamp — surfaces realtime-stream staleness.
const latestSignalSample = await this.signalSampleRepo.findOne({
  where: { userId },
  order: { timestamp: 'DESC' },
  select: ['timestamp'],
});
const latestSignalSampleAt = latestSignalSample?.timestamp.toISOString() ?? null;

// Last 3 calendar nights prior to selectedDate (in requested timezone),
// each with detection presence + raw record count inside the night
// window. nightDate convention matches sleep_detections: the start of
// the calendar evening (00:00 local).
const recentNights = await this.computeRecentNights(userId, selectedKey, timeZone, 3);

// Distinct minute-buckets with ≥1 raw record for today (selectedKey).
// Maxes out at 1440. Used by the coverage bar.
const todayCoverageMinutes = await this.computeTodayCoverageMinutes(
  userId,
  selectedKey,
  timeZone,
);
```

Then in the return object, add:

```typescript
return {
  // …existing fields…
  latestSignalSampleAt,
  recentNights,
  todayCoverageMinutes,
};
```

Add the two helpers as private methods on the class:

```typescript
private async computeRecentNights(
  userId: string,
  selectedKey: string,
  timeZone: string | undefined,
  days: number,
): Promise<Array<{ nightDate: string; hasDetection: boolean; rawRecordCount: number }>> {
  const out: Array<{ nightDate: string; hasDetection: boolean; rawRecordCount: number }> = [];
  for (let i = 1; i <= days; i++) {
    const key = shiftCalendarDay(selectedKey, -i, timeZone); // helper already in service
    const { start, end } = calendarDayBounds(key, timeZone);
    const [detection, count] = await Promise.all([
      this.sleepDetectionRepo.findOne({
        where: { userId, nightDate: Equal(key) },
        select: ['id'],
      }),
      this.rawSensorRepo.count({
        where: { userId, timestamp: Between(start, end) },
      }),
    ]);
    out.push({ nightDate: key, hasDetection: detection != null, rawRecordCount: count });
  }
  return out;
}

private async computeTodayCoverageMinutes(
  userId: string,
  selectedKey: string,
  timeZone: string | undefined,
): Promise<number> {
  const { start, end } = calendarDayBounds(selectedKey, timeZone);
  const rows = await this.rawSensorRepo
    .createQueryBuilder('r')
    .select(`COUNT(DISTINCT date_trunc('minute', r.timestamp))`, 'cnt')
    .where('r.userId = :userId', { userId })
    .andWhere('r.timestamp BETWEEN :start AND :end', { start, end })
    .getRawOne<{ cnt: string }>();
  return rows ? Math.min(1440, parseInt(rows.cnt, 10) || 0) : 0;
}
```

If `shiftCalendarDay` does not exist, add it next to `calendarDayBounds` (look in `apps/backend/src/util/calendar.ts` or wherever `calendarDayBounds` lives):

```typescript
export function shiftCalendarDay(key: string, deltaDays: number, timeZone?: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return calendarDayKey(date, timeZone);
}
```

- [ ] **Step 5: Run tests again**

```bash
cd apps/backend && pnpm test -- debug.service.spec
```

Expected: 3 passes.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/debug/debug.service.ts apps/backend/test/debug.service.spec.ts apps/backend/src/util/calendar.ts
git commit -m "debug: enrich /debug/overview with realtime + nights + coverage"
```

---

## Task 2: Extend `DebugOverview` type on frontend

**Files:**
- Modify: `apps/app/app/services/api/noopClient.ts`

- [ ] **Step 1: Find the `DebugOverview` interface**

```bash
grep -n "export interface DebugOverview\b" apps/app/app/services/api/noopClient.ts
```

- [ ] **Step 2: Add the three fields**

Inside the `DebugOverview` interface, add at the end (before the closing brace):

```typescript
  latestSignalSampleAt: string | null;
  recentNights: Array<{
    nightDate: string;        // YYYY-MM-DD
    hasDetection: boolean;
    rawRecordCount: number;
  }>;
  todayCoverageMinutes: number; // 0..1440
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/services/api/noopClient.ts
git commit -m "app: extend DebugOverview type for inspector card data"
```

---

## Task 3: `InspectorCard` collapsible primitive

**Files:**
- Create: `apps/app/app/components/Inspector/InspectorCard.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { FC, ReactNode, useState } from "react"
import { LayoutAnimation, TouchableOpacity, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"

const COLORS = {
  cardBg: "rgba(0,0,0,0.035)",
  cardBorder: "rgba(0,0,0,0.06)",
  text: "#191015",
  textDim: "#564E4A",
  chevron: "#71717a",
}

type Props = {
  title: string
  pill?: ReactNode
  defaultExpanded?: boolean
  children?: ReactNode
}

export const InspectorCard: FC<Props> = ({ title, pill, defaultExpanded = false, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((v) => !v)
  }

  return (
    <View style={$card}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={$header}>
        <View style={$headerLeft}>
          <Text text={title} size="sm" weight="semiBold" style={{ color: COLORS.text }} />
          {pill ? <View style={{ marginLeft: 8 }}>{pill}</View> : null}
        </View>
        <Text text={expanded ? "▾" : "▸"} size="xs" style={{ color: COLORS.chevron }} />
      </TouchableOpacity>
      {expanded && children ? <View style={$body}>{children}</View> : null}
    </View>
  )
}

const $card: ViewStyle = {
  backgroundColor: COLORS.cardBg,
  borderWidth: 1,
  borderColor: COLORS.cardBorder,
  borderRadius: 14,
  marginBottom: 8,
  overflow: "hidden",
}

const $header: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 12,
  paddingHorizontal: 14,
}

const $headerLeft: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $body: ViewStyle = {
  paddingHorizontal: 14,
  paddingBottom: 12,
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/Inspector/InspectorCard.tsx
git commit -m "app: add InspectorCard collapsible primitive"
```

---

## Task 4: `StatusPill` component

**Files:**
- Create: `apps/app/app/components/Inspector/StatusPill.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"

export type StatusTone = "ok" | "warn" | "bad" | "dim"

const TONE_STYLE: Record<StatusTone, { bg: string; fg: string }> = {
  ok:   { bg: "rgba(34,197,94,0.18)",  fg: "#1a7741" },
  warn: { bg: "rgba(251,191,36,0.20)", fg: "#7a5202" },
  bad:  { bg: "rgba(239,68,68,0.18)",  fg: "#8a1a1a" },
  dim:  { bg: "rgba(0,0,0,0.06)",      fg: "#564E4A" },
}

type Props = { tone: StatusTone; text: string }

export const StatusPill: FC<Props> = ({ tone, text }) => {
  const palette = TONE_STYLE[tone]
  return (
    <View style={[$pill, { backgroundColor: palette.bg }]}>
      <Text text={text} size="xxs" weight="bold" style={{ color: palette.fg }} />
    </View>
  )
}

const $pill: ViewStyle = {
  paddingHorizontal: 7,
  paddingVertical: 2,
  borderRadius: 999,
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/Inspector/StatusPill.tsx
git commit -m "app: add StatusPill component"
```

---

## Task 5: `CoverageBar` segmented bar

**Files:**
- Create: `apps/app/app/components/Inspector/CoverageBar.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { FC } from "react"
import { View, ViewStyle } from "react-native"

type Props = {
  // Total minutes covered out of 1440 in a day.
  coveredMinutes: number
}

const COLORS = {
  track: "rgba(0,0,0,0.08)",
  good: "#22c55e",
  warn: "#fbbf24",
  bad: "#ef4444",
}

function colorForPct(pct: number): string {
  if (pct >= 0.8) return COLORS.good
  if (pct >= 0.3) return COLORS.warn
  return COLORS.bad
}

export const CoverageBar: FC<Props> = ({ coveredMinutes }) => {
  const pct = Math.max(0, Math.min(1, coveredMinutes / 1440))
  const fillColor = colorForPct(pct)
  return (
    <View style={$track}>
      <View style={[$fill, { width: `${pct * 100}%`, backgroundColor: fillColor }]} />
    </View>
  )
}

const $track: ViewStyle = {
  height: 6,
  borderRadius: 3,
  backgroundColor: COLORS.track,
  overflow: "hidden",
}

const $fill: ViewStyle = {
  height: "100%",
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/Inspector/CoverageBar.tsx
git commit -m "app: add CoverageBar component"
```

---

## Task 6: `LiveMonitorCard` with 6 rows + smart-default rule

**Files:**
- Create: `apps/app/app/components/Inspector/LiveMonitorCard.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { FC, useMemo } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { DebugOverview } from "@/services/api/noopClient"
import { useBle } from "@/context/BleContext"
import { useOutboundQueueStats } from "@/hooks/useOutboundQueueStats" // existing, used by OutboundQueueInspector

import { InspectorCard } from "./InspectorCard"
import { StatusPill, StatusTone } from "./StatusPill"

type Props = { overview: DebugOverview | null }

function ageHoursFrom(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, (now - t) / (60 * 60 * 1000))
}

function formatAge(hours: number | null): string {
  if (hours == null) return "—"
  if (hours < 1) return `${Math.round(hours * 60)}m ago`
  if (hours < 24) return `${hours.toFixed(1)}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export const LiveMonitorCard: FC<Props> = ({ overview }) => {
  const ble = useBle()
  const queueStats = useOutboundQueueStats() // returns { depth, deadCount }

  const lastRecordAgeH = ageHoursFrom(overview?.latestRawTimestamp)
  const lastStreamAgeH = ageHoursFrom(overview?.latestSignalSampleAt)
  const lastPipelineAgeH = ageHoursFrom(overview?.latestSyncMetadata?.lastRawRecordAt)
  // Use pipeline_state.lastRunAt when available — falls back to latestRawTimestamp.

  const { tone, pillText, defaultExpanded } = useMemo(() => {
    const isStaleRecord = lastRecordAgeH != null && lastRecordAgeH > 1
    const isBleDown = ble.connectionState !== "ready"
    const isQueueDead = (queueStats.deadCount ?? 0) > 0
    const isLowBattery = (ble.batteryLevel ?? 100) < 15
    const isStreamDead = lastStreamAgeH != null && lastStreamAgeH > 1

    const issues = [isStaleRecord, isBleDown, isQueueDead, isLowBattery, isStreamDead].filter(Boolean).length

    let nextTone: StatusTone = "ok"
    let nextText = "Healthy"
    if (isBleDown || isStreamDead || isQueueDead) {
      nextTone = "bad"
      nextText = isBleDown ? "BLE down" : isStreamDead ? "Stream dead" : "Queue blocked"
    } else if (isStaleRecord || isLowBattery) {
      nextTone = "warn"
      nextText = isStaleRecord ? `Stale ${formatAge(lastRecordAgeH)}` : "Low battery"
    }
    return { tone: nextTone, pillText: nextText, defaultExpanded: issues > 0 }
  }, [ble.connectionState, ble.batteryLevel, lastRecordAgeH, lastStreamAgeH, queueStats.deadCount])

  return (
    <InspectorCard
      title="Live Monitor"
      pill={<StatusPill tone={tone} text={pillText} />}
      defaultExpanded={defaultExpanded}
    >
      <Row label="BLE" value={`${ble.connectionState} · ${ble.isWorn ? "on wrist" : "off wrist"}`} />
      <Row
        label="Battery"
        value={ble.batteryLevel != null
          ? `${ble.batteryLevel.toFixed(0)}% · ${ble.isCharging ? "charging" : "not charging"}`
          : "—"}
        tone={(ble.batteryLevel ?? 100) < 15 ? "warn" : undefined}
      />
      <Row
        label="Last record"
        value={formatAge(lastRecordAgeH)}
        tone={lastRecordAgeH != null && lastRecordAgeH > 6 ? "bad" : lastRecordAgeH != null && lastRecordAgeH > 1 ? "warn" : undefined}
      />
      <Row
        label="Live HR"
        value={
          ble.realtimeHeartRate != null
            ? `${ble.realtimeHeartRate} bpm`
            : lastStreamAgeH != null && lastStreamAgeH > 1
              ? `— (stream dead ${formatAge(lastStreamAgeH)})`
              : "—"
        }
        tone={lastStreamAgeH != null && lastStreamAgeH > 1 ? "bad" : undefined}
      />
      <Row label="Queue" value={`${queueStats.depth ?? 0} pending · ${queueStats.deadCount ?? 0} dead`}
        tone={(queueStats.deadCount ?? 0) > 0 ? "bad" : undefined} />
      <Row
        label="Pipeline"
        value={formatAge(lastPipelineAgeH)}
      />
    </InspectorCard>
  )
}

type RowProps = { label: string; value: string; tone?: "warn" | "bad" }

const TONE_COLOR: Record<NonNullable<RowProps["tone"]>, string> = {
  warn: "#7a5202",
  bad: "#8a1a1a",
}

const Row: FC<RowProps> = ({ label, value, tone }) => (
  <View style={$row}>
    <Text text={label} size="xs" style={{ color: "#564E4A" }} />
    <Text
      text={value}
      size="xs"
      weight="semiBold"
      style={{ color: tone ? TONE_COLOR[tone] : "#191015", fontVariant: ["tabular-nums"] }}
    />
  </View>
)

const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 7,
  borderTopWidth: 1,
  borderTopColor: "rgba(0,0,0,0.06)",
}
```

- [ ] **Step 2: Confirm `useOutboundQueueStats` exists**

```bash
grep -rn "useOutboundQueueStats\|export.*useOutboundQueueStats" apps/app/app | head -3
```

If it does not exist, inline-replace with the same calculation the `OutboundQueueInspector` component does today. Look at its source for the read pattern:

```bash
cat apps/app/app/components/OutboundQueueInspector.tsx | head -60
```

If `OutboundQueueInspector` computes its stats inline, extract them into a new hook:

```typescript
// apps/app/app/hooks/useOutboundQueueStats.ts
import { useEffect, useState } from "react"

import { openDatabase } from "@/services/db"
import { getOutboundQueueStats } from "@/services/db/repositories/outboundQueue"

export function useOutboundQueueStats(): { depth: number; deadCount: number } {
  const [stats, setStats] = useState({ depth: 0, deadCount: 0 })
  useEffect(() => {
    let mounted = true
    const tick = async () => {
      const db = await openDatabase()
      const s = await getOutboundQueueStats(db)
      if (mounted) setStats(s)
    }
    void tick()
    const id = setInterval(tick, 4000)
    return () => { mounted = false; clearInterval(id) }
  }, [])
  return stats
}
```

If `getOutboundQueueStats` doesn't exist either, mirror the SELECT that `OutboundQueueInspector` does today. **Do not invent function names — read the actual file.**

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/components/Inspector/LiveMonitorCard.tsx apps/app/app/hooks/useOutboundQueueStats.ts
git commit -m "app: add LiveMonitorCard with smart-default expand rule"
```

---

## Task 7: `DiagnosticsCard` with last-nights + coverage + last-run

**Files:**
- Create: `apps/app/app/components/Inspector/DiagnosticsCard.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { FC, useMemo } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { DebugOverview } from "@/services/api/noopClient"

import { CoverageBar } from "./CoverageBar"
import { InspectorCard } from "./InspectorCard"
import { StatusPill, StatusTone } from "./StatusPill"

type Props = {
  overview: DebugOverview | null
  // Last pipeline run summary (optional — caller already fetches /debug/pipeline-runs
  // for the existing screen; reuse).
  lastPipelineRun?: {
    startedAt: string
    durationMs: number
    detections: number
    sleepStages: number
    computeMs: number | null
    skipped: boolean
  } | null
}

function formatNightDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(0)}s`
}

export const DiagnosticsCard: FC<Props> = ({ overview, lastPipelineRun }) => {
  const recentNights = overview?.recentNights ?? []
  const coverageMin = overview?.todayCoverageMinutes ?? 0

  const { tone, pillText, defaultExpanded } = useMemo(() => {
    const missed = recentNights.filter((n) => !n.hasDetection).length
    const coveragePct = coverageMin / 1440
    const issues = missed + (coveragePct < 0.8 ? 1 : 0)
    let nextTone: StatusTone = "ok"
    let nextText = "OK"
    if (missed > 0) {
      nextTone = missed >= 2 ? "bad" : "warn"
      nextText = `${missed} night${missed === 1 ? "" : "s"} missed`
    } else if (coveragePct < 0.3) {
      nextTone = "bad"
      nextText = "Low coverage"
    } else if (coveragePct < 0.8) {
      nextTone = "warn"
      nextText = "Coverage gap"
    }
    return { tone: nextTone, pillText: nextText, defaultExpanded: issues > 0 }
  }, [recentNights, coverageMin])

  return (
    <InspectorCard
      title="Diagnostics"
      pill={<StatusPill tone={tone} text={pillText} />}
      defaultExpanded={defaultExpanded}
    >
      <SectionLabel text="Last 3 nights" />
      {recentNights.length === 0 ? (
        <Text text="No data" size="xs" style={{ color: "#564E4A" }} />
      ) : (
        recentNights.map((n) => (
          <NightRow key={n.nightDate} night={n} />
        ))
      )}

      <SectionLabel text="Today's coverage" />
      <CoverageBar coveredMinutes={coverageMin} />
      <View style={[$row, { borderTopWidth: 0, paddingTop: 4 }]}>
        <Text
          text={`${coverageMin} min of 1440`}
          size="xs"
          style={{ color: "#564E4A", fontVariant: ["tabular-nums"] }}
        />
        <Text
          text={`${((coverageMin / 1440) * 100).toFixed(0)}%`}
          size="xs"
          weight="semiBold"
          style={{ fontVariant: ["tabular-nums"] }}
        />
      </View>

      <SectionLabel text="Last pipeline run" />
      {lastPipelineRun ? (
        <>
          <Row label={new Date(lastPipelineRun.startedAt).toLocaleTimeString()}
               value={`${lastPipelineRun.detections} det · ${lastPipelineRun.sleepStages} stages`} />
          {lastPipelineRun.computeMs != null ? (
            <Row
              label="compute"
              value={`${formatDuration(lastPipelineRun.computeMs)} of ${formatDuration(lastPipelineRun.durationMs)}`}
              tone={lastPipelineRun.computeMs > 60_000 ? "warn" : undefined}
            />
          ) : null}
        </>
      ) : (
        <Text text="No runs yet" size="xs" style={{ color: "#564E4A" }} />
      )}
    </InspectorCard>
  )
}

const SectionLabel: FC<{ text: string }> = ({ text }) => (
  <Text
    text={text}
    size="xxs"
    weight="bold"
    style={{ color: "#564E4A", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8, marginBottom: 4 }}
  />
)

const NightRow: FC<{ night: { nightDate: string; hasDetection: boolean; rawRecordCount: number } }> = ({ night }) => (
  <View style={$row}>
    <Text text={formatNightDate(night.nightDate)} size="xs" style={{ color: "#564E4A" }} />
    <Text
      text={night.hasDetection ? "classified" : `no detection · ${night.rawRecordCount} rec`}
      size="xs"
      weight="semiBold"
      style={{
        color: night.hasDetection ? "#191015" : "#8a1a1a",
        fontVariant: ["tabular-nums"],
      }}
    />
  </View>
)

type RowProps = { label: string; value: string; tone?: "warn" | "bad" }
const TONE_COLOR: Record<NonNullable<RowProps["tone"]>, string> = { warn: "#7a5202", bad: "#8a1a1a" }
const Row: FC<RowProps> = ({ label, value, tone }) => (
  <View style={$row}>
    <Text text={label} size="xs" style={{ color: "#564E4A" }} />
    <Text text={value} size="xs" weight="semiBold"
      style={{ color: tone ? TONE_COLOR[tone] : "#191015", fontVariant: ["tabular-nums"] }} />
  </View>
)

const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 5,
  borderTopWidth: 1,
  borderTopColor: "rgba(0,0,0,0.06)",
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/Inspector/DiagnosticsCard.tsx
git commit -m "app: add DiagnosticsCard with nights + coverage + last-run"
```

---

## Task 8: `ActionsCard` with Data + Recovery button groups

**Files:**
- Create: `apps/app/app/components/Inspector/ActionsCard.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { FC, ReactNode } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"

import { InspectorCard } from "./InspectorCard"

type ActionHandler = () => void | Promise<void>

type Props = {
  onSync: ActionHandler
  onForceUpload: ActionHandler
  onRunPipeline: ActionHandler
  onRefreshView: ActionHandler
  onRebootStrap: ActionHandler
  onPowerCycleStrap: ActionHandler
  onClearQueue: ActionHandler
  onOpenWebInspector: ActionHandler
}

export const ActionsCard: FC<Props> = (handlers) => (
  <InspectorCard title="Actions" defaultExpanded={false}>
    <SectionLabel text="Data" />
    <Grid>
      <Btn label="Sync from Strap" onPress={handlers.onSync} />
      <Btn label="Force Upload" onPress={handlers.onForceUpload} />
      <Btn label="Run Pipeline" onPress={handlers.onRunPipeline} />
      <Btn label="Refresh View" onPress={handlers.onRefreshView} />
    </Grid>
    <SectionLabel text="Recovery" />
    <Grid>
      <Btn label="Reboot Strap" onPress={handlers.onRebootStrap} danger />
      <Btn label="Power-cycle Strap" onPress={handlers.onPowerCycleStrap} danger />
      <Btn label="Clear Queue" onPress={handlers.onClearQueue} />
      <Btn label="Open Web Inspector" onPress={handlers.onOpenWebInspector} />
    </Grid>
  </InspectorCard>
)

const SectionLabel: FC<{ text: string }> = ({ text }) => (
  <Text
    text={text}
    size="xxs"
    weight="bold"
    style={{ color: "#564E4A", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8, marginBottom: 6 }}
  />
)

const Grid: FC<{ children: ReactNode }> = ({ children }) => (
  <View style={$grid}>{children}</View>
)

const Btn: FC<{ label: string; onPress: ActionHandler; danger?: boolean }> = ({ label, onPress, danger }) => (
  <TouchableOpacity
    onPress={() => void onPress()}
    activeOpacity={0.7}
    style={[$btn, danger ? $btnDanger : null]}
  >
    <Text
      text={label}
      size="xxs"
      weight="semiBold"
      style={{ color: danger ? "#8a1a1a" : "#191015", textAlign: "center" }}
    />
  </TouchableOpacity>
)

const $grid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 6,
}

const $btn: ViewStyle = {
  flexBasis: "48%",
  flexGrow: 1,
  backgroundColor: "rgba(0,0,0,0.06)",
  borderRadius: 8,
  paddingVertical: 10,
  paddingHorizontal: 8,
  alignItems: "center",
}

const $btnDanger: ViewStyle = {
  backgroundColor: "rgba(239,68,68,0.12)",
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/Inspector/ActionsCard.tsx
git commit -m "app: add ActionsCard with data + recovery button groups"
```

---

## Task 9: Refactor `DebugInspectorScreen` to compose the cards

**Files:**
- Modify: `apps/app/app/screens/DebugInspectorScreen.tsx`

- [ ] **Step 1: Read the current screen to identify what's preserved vs replaced**

```bash
wc -l apps/app/app/screens/DebugInspectorScreen.tsx
grep -n "^  const\|^  use\|handleSync\|handleForceUpload\|handleRunPipeline\|handleClearQueue\|handleRebootStrap\|handlePowerCycleStrap" apps/app/app/screens/DebugInspectorScreen.tsx | head -20
```

Identify which state + handlers stay (data fetching + action handlers) and what's removed (the existing layout below `return (`).

- [ ] **Step 2: Add a fetch for last pipeline run**

Above `useEffect(() => { void refreshInspector() }, …)`:

```typescript
const [lastPipelineRun, setLastPipelineRun] = useState<{
  startedAt: string
  durationMs: number
  detections: number
  sleepStages: number
  computeMs: number | null
  skipped: boolean
} | null>(null)
```

Inside `refreshInspector`, after the existing `Promise.all`, add:

```typescript
try {
  const runs = await fetchDebugPipelineRuns(1) // import from noopClient
  if (runs.runs.length > 0) {
    const r = runs.runs[0]
    setLastPipelineRun({
      startedAt: r.startedAt,
      durationMs: r.durationMs,
      detections: r.detections,
      sleepStages: r.sleepStages,
      computeMs: r.stages?.compute ?? null,
      skipped: r.skipped,
    })
  } else {
    setLastPipelineRun(null)
  }
} catch {
  setLastPipelineRun(null) // non-fatal
}
```

If `fetchDebugPipelineRuns` does not exist in `noopClient.ts`, add a thin wrapper above the existing `runDebugPipeline`:

```typescript
export async function fetchDebugPipelineRuns(limit = 30): Promise<{
  count: number
  stageMedians: Record<string, number>
  runs: Array<{
    id: string
    startedAt: string
    durationMs: number
    skipped: boolean
    stages: Record<string, number> | null
    detections: number
    sleepStages: number
    features: number
  }>
}> {
  return apiGet(`/debug/pipeline-runs?limit=${limit}`)
}
```

- [ ] **Step 3: Replace the JSX**

Find `return (` (around line 173) and replace the body up to its closing `</SafeAreaView>` with:

```tsx
return (
  <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Text text="Inspector" size="lg" weight="semiBold" style={{ marginBottom: 14 }} />

      {error ? (
        <View style={{ backgroundColor: "rgba(239,68,68,0.12)", padding: 10, borderRadius: 12, marginBottom: 8 }}>
          <Text text={error} size="xs" weight="semiBold" style={{ color: "#8a1a1a" }} />
        </View>
      ) : null}
      {banner ? (
        <View style={{ backgroundColor: "rgba(0,0,0,0.05)", padding: 10, borderRadius: 12, marginBottom: 8 }}>
          <Text text={banner} size="xs" weight="semiBold" />
        </View>
      ) : null}

      <LiveMonitorCard overview={overview} />
      <DiagnosticsCard overview={overview} lastPipelineRun={lastPipelineRun} />
      <ActionsCard
        onSync={handleSync}
        onForceUpload={handleForceUpload}
        onRunPipeline={handleRunPipeline}
        onRefreshView={() => void refreshInspector()}
        onRebootStrap={handleRebootStrap}
        onPowerCycleStrap={handlePowerCycleStrap}
        onClearQueue={handleClearQueue}
        onOpenWebInspector={() => openLinkInBrowser(INSPECTOR_WEB_URL)}
      />

      {isLoading && !overview ? (
        <View style={{ paddingVertical: 14, alignItems: "center" }}>
          <ActivityIndicator color="#C76542" />
        </View>
      ) : null}
    </ScrollView>
  </SafeAreaView>
)
```

Add imports at the top:

```typescript
import { LiveMonitorCard } from "@/components/Inspector/LiveMonitorCard"
import { DiagnosticsCard } from "@/components/Inspector/DiagnosticsCard"
import { ActionsCard } from "@/components/Inspector/ActionsCard"
```

- [ ] **Step 4: Remove the now-unused old layout helpers**

Delete the unused `MetricTile`, `BatteryDetail`, `LevelBar`, `ActionButton`, `ButtonRow` definitions and their associated `$styles` constants near the bottom of the file. Also remove `LocalDbDiagnostics` and `OutboundQueueInspector` imports — their contents have been absorbed into the cards via the queue stats hook + overview fields.

If `LocalDbDiagnostics` or `OutboundQueueInspector` is used elsewhere, leave the file/component in place but delete the import. If not, leave them alone — out of scope.

- [ ] **Step 5: Delete the `Log Out` button**

Find the row containing `<ActionButton label="Log Out" …>` (now in the deleted layout — confirm it's gone). The button's logic (`forceLogout(); void logout()`) moves to `DeviceSettingsScreen` in Task 11.

- [ ] **Step 6: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/app/app/screens/DebugInspectorScreen.tsx apps/app/app/services/api/noopClient.ts
git commit -m "app: refactor inspector screen to compose 3 cards"
```

---

## Task 10: Wire `Inspector` into `MainNavigator` as 4th tab

**Files:**
- Modify: `apps/app/app/navigators/MainNavigator.tsx`

- [ ] **Step 1: Add the import and tab config**

In `apps/app/app/navigators/MainNavigator.tsx`:

```typescript
import { DebugInspectorScreen } from "@/screens/DebugInspectorScreen"
```

Extend `TAB_CONFIG`:

```typescript
const TAB_CONFIG = {
  Home: { icon: "home-outline", activeIcon: "home", label: "Home" },
  Trends: { icon: "stats-chart-outline", activeIcon: "stats-chart", label: "Trends" },
  Device: { icon: "radio-outline", activeIcon: "radio", label: "Device" },
  Inspector: { icon: "pulse-outline", activeIcon: "pulse", label: "Inspector" },
} as const
```

- [ ] **Step 2: Add the `Tab.Screen`**

After `<Tab.Screen name="Device" component={DeviceScreen} />`:

```tsx
<Tab.Screen name="Inspector" component={DebugInspectorScreen} />
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/navigators/MainNavigator.tsx
git commit -m "app: add Inspector tab to MainNavigator"
```

---

## Task 11: Clean up `DeviceSettingsScreen` — remove Diagnostics link, add Log Out

**Files:**
- Modify: `apps/app/app/screens/DeviceSettingsScreen.tsx`

- [ ] **Step 1: Locate the Diagnostics link**

```bash
grep -n "debug-inspector\|Diagnostics" apps/app/app/screens/DeviceSettingsScreen.tsx
```

- [ ] **Step 2: Remove the `TouchableOpacity` wrapping the "Diagnostics" text**

Delete the entire block (roughly):

```tsx
<TouchableOpacity
  activeOpacity={0.5}
  onPress={() => router.push("/debug-inspector")}
  style={themed($debugLink)}
>
  <Text text="Diagnostics" size="xxs" style={themed($debugText)} />
</TouchableOpacity>
```

- [ ] **Step 3: Add a Log Out row in its place**

Use the existing destructive-button style pattern from this same file (around `$destructiveButton`):

```tsx
import { useAuth } from "@/context/AuthContext"
import { forceLogout } from "@/services/api/noopClient"
// …
const { logout } = useAuth()
// …
<TouchableOpacity
  style={themed($destructiveButton)}
  activeOpacity={0.8}
  onPress={() => { forceLogout(); void logout() }}
>
  <Text text="Log Out" size="xs" weight="semiBold" />
</TouchableOpacity>
```

- [ ] **Step 4: Remove now-unused `$debugLink` and `$debugText` style helpers if they're only referenced here**

```bash
grep -rn "\\$debugLink\\|\\$debugText" apps/app/app | head
```

If only this file references them, delete the definitions.

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/screens/DeviceSettingsScreen.tsx
git commit -m "app: move Log Out out of Inspector into Device Settings"
```

---

## Task 12: Build, install, and verify on device

**Files:** none (verification only)

- [ ] **Step 1: Build Release + install**

```bash
cd apps/app && npx expo run:ios --device 00008150-00163CC43AA1401C --configuration Release
```

If the phone is locked, expect the install to fail at "Connecting to: Nishant's iPhone — device is locked." Unlock and re-run.

- [ ] **Step 2: Verify the 4th tab appears**

Open the app. Bottom bar should show Home · Trends · Device · Inspector. Tap Inspector.

- [ ] **Step 3: Verify smart-default expand rules**

Walk through each scenario:

| State | Expected pill / expand |
|---|---|
| All green (recent data, classification last night, healthy queue) | All cards collapsed, Live pill `Healthy` (green) |
| `latestRawTimestamp` &gt; 1 h | Live expanded, pill `Stale Xh` (amber) |
| `signal_samples` empty &gt; 1 h | Live expanded, pill `Stream dead` (red) |
| 1+ of last 3 nights with no detection | Diagnostics expanded, pill `N nights missed` |
| `todayCoverageMinutes` &lt; 432 (30%) | Diagnostics expanded, pill `Low coverage` |

- [ ] **Step 4: Verify all 8 action buttons**

Tap each one. Sync, Force Upload, Run Pipeline, Refresh View should produce a banner or error. Reboot and Power-cycle should each show a confirmation `Alert.alert`. Clear Queue, Open Web Inspector should work as before.

- [ ] **Step 5: Verify Settings → no Diagnostics link, Log Out works**

Open Settings tab → confirm Diagnostics link is gone. Tap Log Out → confirm sign-out succeeds.

- [ ] **Step 6: Final commit (style polish if anything looked off)**

If the build looked correct, no commit needed. If you tweaked spacing/colors in the visual review:

```bash
git add -p apps/app/app/components/Inspector apps/app/app/screens/DebugInspectorScreen.tsx
git commit -m "app: visual polish after device verification"
```

---

## Spec Coverage Checklist

- [x] 4th tab "Inspector", always visible — Task 10
- [x] Replace `DebugInspectorScreen` layout with three collapsible cards — Tasks 3–9
- [x] Remove Settings → Diagnostics link — Task 11
- [x] Move Log Out out of Inspector — Task 9 (removal) + Task 11 (re-home)
- [x] Smart-default expand rules — Tasks 6 (Live) and 7 (Diagnostics)
- [x] Live Monitor 6 rows — Task 6
- [x] Diagnostics 3 sub-sections + coverage bar — Tasks 5, 7
- [x] Actions Data + Recovery groups — Task 8
- [x] Backend overview enrichment (`latestSignalSampleAt`, `recentNights`, `todayCoverageMinutes`) — Task 1
- [x] Frontend `DebugOverview` type extension — Task 2
- [x] Visual treatment "minimal cards · status pills" — embodied in Tasks 3, 4
- [x] Reuse theme palette tokens — every component uses the existing `#191015`, `#564E4A`, `rgba(0,0,0,0.03)`, status colors that match `app/theme`
- [x] Manual testing across 5 state scenarios — Task 12 step 3
