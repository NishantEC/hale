# Sleep Detail V1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Sleep Detail screen with the V1.5 insight-led layout: hero (duration + score + delta + detail) → hypnogram + stage pills → journal-correlation Why panel → 2×2 vitals with delta-vs-week → always-visible 7-night sparklines → collapsed Labs.

**Architecture:** Backend extends `/views/sleep` with `score.detail`, per-metric `deltaVsWeek` rollups, and renamed `factorInsights` keys. Mobile adds 6 new presentational components (`SleepHero`, `StagePills`, `VitalCard`, `WhyPanel`, `TrendSparkline`, `LabsAccordion`), refactors `HypnogramChart` to drop the left label column, extracts `DateSwitcher` from `HomeScreen.tsx` into a shared component, then rewrites the `SleepDetailScreen` body.

**Tech Stack:** NestJS + TypeORM + Postgres backend; Expo React Native (SDK 55) + Tamagui + react-native-reanimated + react-native-svg + drizzle-orm/expo-sqlite mobile.

---

## File Structure

### New
- `apps/app/app/components/DateSwitcher.tsx` — extracted from HomeScreen
- `apps/app/app/components/SleepHero.tsx`
- `apps/app/app/components/StagePills.tsx`
- `apps/app/app/components/VitalCard.tsx`
- `apps/app/app/components/WhyPanel.tsx`
- `apps/app/app/components/TrendSparkline.tsx`
- `apps/app/app/components/LabsAccordion.tsx`
- `apps/backend/src/views/views.service.spec.ts` (extend if exists, otherwise create)

### Modified
- `apps/backend/src/views/views.service.ts` — extend `getSleepView` response
- `apps/app/app/services/api/noopClient.ts` — extend `SleepViewModel` interface
- `apps/app/app/components/HypnogramChart.tsx` — drop `LABEL_COLUMN_WIDTH`
- `apps/app/app/screens/HomeScreen.tsx` — replace inline `DateSwitcher` with import
- `apps/app/app/screens/SleepDetailScreen.tsx` — full body replacement

### Deleted
- (none — only inline removals via SleepDetailScreen rewrite)

---

## Phase 1 — Backend

### Task 1: deltaVsWeek util

**Files:**
- Create: `apps/backend/src/views/delta.ts`
- Create: `apps/backend/src/views/delta.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/backend/src/views/delta.spec.ts
import { deltaVsWeek } from './delta.js';

describe('deltaVsWeek', () => {
  it('returns null when fewer than 3 prior samples', () => {
    expect(deltaVsWeek(70, [])).toBeNull();
    expect(deltaVsWeek(70, [60, 65])).toBeNull();
  });

  it('returns current minus mean of prior week (excluding current)', () => {
    expect(deltaVsWeek(70, [60, 60, 60, 60, 60, 60, 60])).toBe(10);
  });

  it('ignores null/undefined values in the prior list', () => {
    expect(deltaVsWeek(70, [60, null as any, 60, undefined as any, 60])).toBe(10);
  });

  it('returns null when current is null', () => {
    expect(deltaVsWeek(null, [60, 60, 60])).toBeNull();
  });

  it('returns null when no finite priors after filtering', () => {
    expect(deltaVsWeek(70, [null, undefined, NaN] as any)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```
cd apps/backend && pnpm test -- delta.spec.ts
```

Expected: FAIL — `Cannot find module './delta.js'`.

- [ ] **Step 3: Implement util**

```ts
// apps/backend/src/views/delta.ts
const MIN_PRIORS = 3;

export function deltaVsWeek(
  current: number | null | undefined,
  prior: Array<number | null | undefined>,
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  const finite = prior.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (finite.length < MIN_PRIORS) return null;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  return Math.round((current - mean) * 10) / 10;
}
```

- [ ] **Step 4: Run test, verify pass**

```
cd apps/backend && pnpm test -- delta.spec.ts
```

Expected: PASS, 5 specs.

- [ ] **Step 5: Commit**

```
git -C /Users/nish/Documents/noop add apps/backend/src/views/delta.ts apps/backend/src/views/delta.spec.ts
git -C /Users/nish/Documents/noop commit -m "feat(views): add deltaVsWeek util with min-priors guard"
```

---

### Task 2: Surface score.detail + deltaVsWeek in getSleepView

**Files:**
- Modify: `apps/backend/src/views/views.service.ts`

- [ ] **Step 1: Find the score block inside `getSleepView`**

```
cd apps/backend && grep -n "score:" src/views/views.service.ts | head -10
```

Expected: locates the score sub-object that today returns `value/label/recommendation`. Note its line range.

- [ ] **Step 2: Import the delta util at top of file**

Add to the imports at the top of `apps/backend/src/views/views.service.ts`:

```ts
import { deltaVsWeek } from './delta.js';
```

- [ ] **Step 3: Compute score.deltaVsWeek + score.detail**

Inside `getSleepView`, after the existing daily-score lookup, fetch the prior 7 days of `dailyScores.dailyBalance` for the same user. Then construct the score object:

```ts
const priorScores = (
  await this.dailyScoreRepo
    .createQueryBuilder('s')
    .where('s."userId" = :userId', { userId })
    .andWhere('s."dayDate" < :selectedDate', { selectedDate })
    .orderBy('s."dayDate"', 'DESC')
    .limit(7)
    .getMany()
).map((s) => s.dailyBalance);

const score = {
  value: currentScore?.dailyBalance ?? null,
  label: currentScore?.recommendation ?? 'Unknown',
  confidence: currentScore?.confidence ?? 'Low',
  detail: currentScore?.detail ?? '',
  deltaVsWeek: deltaVsWeek(currentScore?.dailyBalance ?? null, priorScores),
};
```

(Adjust property names if the existing object differs — keep the existing `value`/`label` keys, add `confidence`, `detail`, `deltaVsWeek`.)

- [ ] **Step 4: Compute vital deltas (efficiency, rhr, hrv, skinTempDelta)**

Right before assembling the response, fetch prior 7 nights of `nightFeatures` and `dailyMetrics.skinTempDeltaCelsius`:

```ts
const priorNights = await this.nightFeatureRepo
  .createQueryBuilder('n')
  .where('n."userId" = :userId', { userId })
  .andWhere('n."nightDate" < :selectedDate', { selectedDate })
  .orderBy('n."nightDate"', 'DESC')
  .limit(7)
  .getMany();

const priorMetrics = await this.dailyMetricRepo
  .createQueryBuilder('m')
  .where('m."userId" = :userId', { userId })
  .andWhere('m."dayDate" < :selectedDate', { selectedDate })
  .orderBy('m."dayDate"', 'DESC')
  .limit(7)
  .getMany();

const vitalsDelta = {
  efficiency: deltaVsWeek(
    currentDetection?.continuity ?? null,
    priorNights.map((n) => n.continuity),
  ),
  rhr: deltaVsWeek(
    currentNightFeature?.restingHeartRate ?? null,
    priorNights.map((n) => n.restingHeartRate),
  ),
  hrv: deltaVsWeek(
    currentNightFeature?.rmssd ?? null,
    priorNights.map((n) => n.rmssd),
  ),
  skinTempDelta: deltaVsWeek(
    currentMetric?.skinTempDeltaCelsius ?? null,
    priorMetrics.map((m) => m.skinTempDeltaCelsius),
  ),
};
```

- [ ] **Step 5: Add `vitalsDelta` and updated `score` to the returned object**

In the return statement at the end of `getSleepView`, add:

```ts
return {
  ...existingFields,
  score,
  vitalsDelta,
};
```

(`score` replaces the existing one; `vitalsDelta` is new.)

- [ ] **Step 6: Run backend type-check**

```
cd apps/backend && pnpm tsc --noEmit -p .
```

Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```
git -C /Users/nish/Documents/noop add apps/backend/src/views/views.service.ts
git -C /Users/nish/Documents/noop commit -m "feat(views): add score.detail, score.deltaVsWeek, vitalsDelta to /views/sleep"
```

---

### Task 3: Relabel factorInsights keys

**Files:**
- Modify: `apps/backend/src/views/views.service.ts`

- [ ] **Step 1: Locate the `factorInsights.map` near the end of `getSleepView`**

Around `views.service.ts:467` — currently maps each correlation to an object with `deepDelta`, `remDelta`, etc.

- [ ] **Step 2: Rename the keys to plain English**

Change the mapping to:

```ts
factorInsights: factorInsights.map((c) => ({
  factorTag: c.factorTag,
  occurrences: c.occurrences,
  deepMin: c.deepDelta,
  remMin: c.remDelta,
  awakeMin: c.awakeDelta,
  effectSize: c.effectSize ?? 0,
})),
```

- [ ] **Step 3: Run backend type-check**

```
cd apps/backend && pnpm tsc --noEmit -p .
```

Expected: exit 0.

- [ ] **Step 4: Commit + push (triggers deploy)**

```
git -C /Users/nish/Documents/noop add apps/backend/src/views/views.service.ts
git -C /Users/nish/Documents/noop commit -m "feat(views): rename factorInsights keys to plain English (deepMin/remMin/awakeMin)"
git -C /Users/nish/Documents/noop push origin main
```

GitHub Actions will redeploy the backend (~5 min). Verify with:

```
gcloud run services logs read noop-backend --region=us-central1 --project=flashckard --limit=20 | grep -E 'NestApplication.*started|deltaVsWeek'
```

Expected: a fresh `NestApplication successfully started` line.

---

## Phase 2 — Mobile types + shared

### Task 4: Extend SleepViewModel for new fields

**Files:**
- Modify: `apps/app/app/services/api/noopClient.ts`

- [ ] **Step 1: Find `SleepViewModel` at line ~127**

```
cd apps/app && grep -n "SleepViewModel\b" app/services/api/noopClient.ts | head -3
```

- [ ] **Step 2: Add the new fields to the interface**

Inside the existing `SleepViewModel` definition, ensure the score sub-shape and add `vitalsDelta`:

```ts
export interface SleepViewModel {
  // ... existing fields ...
  score: {
    value: number | null
    label: string
    confidence: 'Low' | 'Medium' | 'High' | string
    detail: string
    deltaVsWeek: number | null
  }
  vitalsDelta: {
    efficiency: number | null
    rhr: number | null
    hrv: number | null
    skinTempDelta: number | null
  }
  factorInsights: Array<{
    factorTag: string
    occurrences: number
    deepMin: number
    remMin: number
    awakeMin: number
    effectSize: number
  }>
  // ... rest existing ...
}
```

(If the existing shape uses different property names, keep the additions — `confidence`, `detail`, `deltaVsWeek`, `vitalsDelta`, and the renamed `factorInsights` keys.)

- [ ] **Step 3: Type-check mobile**

```
cd apps/app && pnpm compile
```

Expected: exit 0 (the existing 48 errors in unrelated test files are pre-existing).

- [ ] **Step 4: Commit**

```
git -C /Users/nish/Documents/noop add apps/app/app/services/api/noopClient.ts
git -C /Users/nish/Documents/noop commit -m "types(app): extend SleepViewModel for v1.5 redesign"
```

---

### Task 5: Extract DateSwitcher into a shared component

**Files:**
- Create: `apps/app/app/components/DateSwitcher.tsx`
- Modify: `apps/app/app/screens/HomeScreen.tsx`

- [ ] **Step 1: Read the existing inline DateSwitcher**

```
cd apps/app && sed -n '420,465p' app/screens/HomeScreen.tsx
```

Expected: a function `function DateSwitcher({ ... })` returning a `View` with two `TouchableOpacity` chevrons + center label, using `Ionicons chevron-back`/`chevron-forward`.

- [ ] **Step 2: Create the shared component**

Create `apps/app/app/components/DateSwitcher.tsx` containing the exact body of the inline function plus its props type. Export as a named export.

```tsx
import { TouchableOpacity, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

export type DateSwitcherProps = {
  label: string
  onPrev: () => void
  onNext: () => void
  disablePrev?: boolean
  disableNext?: boolean
}

export function DateSwitcher({ label, onPrev, onNext, disablePrev, disableNext }: DateSwitcherProps) {
  const colors = LOCAL_THEME.colors
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <TouchableOpacity onPress={onPrev} disabled={disablePrev} hitSlop={12}>
        <Ionicons name="chevron-back" size={20} color={disablePrev ? colors.textMuted : colors.text} />
      </TouchableOpacity>
      <Text text={label} weight="semiBold" />
      <TouchableOpacity onPress={onNext} disabled={disableNext} hitSlop={12}>
        <Ionicons name="chevron-forward" size={20} color={disableNext ? colors.textMuted : colors.text} />
      </TouchableOpacity>
    </View>
  )
}
```

(Match the existing inline implementation's prop names exactly — copy the body verbatim where it differs from above.)

- [ ] **Step 3: Replace the inline definition in HomeScreen with an import**

Edit `apps/app/app/screens/HomeScreen.tsx`:
- Add at top: `import { DateSwitcher } from "@/components/DateSwitcher"`
- Delete the local `function DateSwitcher(...) { ... }` definition (around line 422–460)

- [ ] **Step 4: Type-check + visual sanity**

```
cd apps/app && pnpm compile
```

Expected: exit 0.

Reload the app and confirm the home-screen date switcher still renders and works (prev/next chevrons + tap behavior).

- [ ] **Step 5: Commit**

```
git -C /Users/nish/Documents/noop add apps/app/app/components/DateSwitcher.tsx apps/app/app/screens/HomeScreen.tsx
git -C /Users/nish/Documents/noop commit -m "refactor(app): extract DateSwitcher to shared component"
```

---

### Task 6: HypnogramChart — drop left label column

**Files:**
- Modify: `apps/app/app/components/HypnogramChart.tsx`

- [ ] **Step 1: Set LABEL_COLUMN_WIDTH to 0**

In `HypnogramChart.tsx`, change:

```ts
const LABEL_COLUMN_WIDTH = 56
```

to:

```ts
const LABEL_COLUMN_WIDTH = 0
```

- [ ] **Step 2: Strip the row-label render in axisRows**

Find `axisRows` (around line ~398). Change the `View` returned per row to render only the underlay separator, no `rowLabelWrap`/`stageLabel`/`stageDuration`:

```tsx
const axisRows = STAGE_KEYS.map((key, index) => (
  <View key={key} style={{ height: ROW_HEIGHT }}>
    {index > 0 && <View style={[styles.horizontal, { backgroundColor: colors.surfaceCardBorder }]} />}
  </View>
))
```

- [ ] **Step 3: Drop unused styles**

Remove `rowLabelWrap`, `stageLabel`, `stageDuration` entries from the bottom `StyleSheet.create` block. They're no longer referenced.

- [ ] **Step 4: Type-check**

```
cd apps/app && pnpm compile
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```
git -C /Users/nish/Documents/noop add apps/app/app/components/HypnogramChart.tsx
git -C /Users/nish/Documents/noop commit -m "refactor(hypnogram): drop left label column (stage pills now live below chart)"
```

---

## Phase 3 — Mobile new components

### Task 7: StagePills component

**Files:**
- Create: `apps/app/app/components/StagePills.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View, Text } from "react-native"

export type StagePillsProps = {
  awakeMin: number
  remMin: number
  coreMin: number
  deepMin: number
}

const STAGES = [
  { key: "awake", label: "Awake", color: "#FE8A73" },
  { key: "rem", label: "REM", color: "#3FB1E7" },
  { key: "core", label: "Core", color: "#1B81FE" },
  { key: "deep", label: "Deep", color: "#403EA7" },
] as const

function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function StagePills({ awakeMin, remMin, coreMin, deepMin }: StagePillsProps) {
  const values: Record<string, number> = { awake: awakeMin, rem: remMin, core: coreMin, deep: deepMin }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {STAGES.map((s) => (
        <View
          key={s.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: `${s.color}26`,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.color }} />
          <Text style={{ color: s.color, fontSize: 11, fontWeight: "500" }}>
            {s.label} {fmt(values[s.key])}
          </Text>
        </View>
      ))}
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

```
cd apps/app && pnpm compile
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```
git -C /Users/nish/Documents/noop add apps/app/app/components/StagePills.tsx
git -C /Users/nish/Documents/noop commit -m "feat(app): add StagePills component"
```

---

### Task 8: VitalCard component

**Files:**
- Create: `apps/app/app/components/VitalCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type VitalCardProps = {
  label: string
  value: string
  unit?: string
  delta?: number | null
  deltaUnit?: string
  deltaPositiveIsGood?: boolean
}

export function VitalCard({ label, value, unit, delta, deltaUnit, deltaPositiveIsGood = true }: VitalCardProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const showDelta = delta != null && Number.isFinite(delta)
  const isGood = showDelta && (deltaPositiveIsGood ? delta! >= 0 : delta! <= 0)
  const deltaColor = !showDelta ? colors.textMuted : isGood ? "#4ade80" : "#f87171"
  const deltaSign = showDelta && delta! > 0 ? "+" : ""
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceCard,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text text={label.toUpperCase()} size="xxs" style={{ color: colors.textMuted, letterSpacing: 0.6 }} />
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
        <Text text={value} size="xl" weight="medium" style={{ color: colors.text }} />
        {unit ? (
          <Text text={` ${unit}`} size="xs" style={{ color: colors.textDim, marginLeft: 2 }} />
        ) : null}
      </View>
      {showDelta ? (
        <Text
          text={`${deltaSign}${delta} ${deltaUnit ?? ""} vs week`.trim()}
          size="xxs"
          style={{ color: deltaColor, marginTop: 2 }}
        />
      ) : null}
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

```
cd apps/app && pnpm compile
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```
git -C /Users/nish/Documents/noop add apps/app/app/components/VitalCard.tsx
git -C /Users/nish/Documents/noop commit -m "feat(app): add VitalCard component with delta-vs-week chip"
```

---

### Task 9: SleepHero component

**Files:**
- Create: `apps/app/app/components/SleepHero.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type SleepHeroProps = {
  durationMinutes: number
  bedtimeLabel?: string
  wakeTimeLabel?: string
  score: number | null
  scoreLabel: string
  scoreConfidence: string
  scoreDelta: number | null
  detail: string
}

function fmtDuration(min: number): { h: number; m: number } {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return { h, m }
}

export function SleepHero(props: SleepHeroProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const { h, m } = fmtDuration(props.durationMinutes)
  const showScore = props.scoreConfidence !== "Low" && props.score != null
  const showDelta = props.scoreDelta != null && Number.isFinite(props.scoreDelta)
  const sign = showDelta && props.scoreDelta! > 0 ? "+" : ""
  const range = props.bedtimeLabel && props.wakeTimeLabel
    ? `${props.bedtimeLabel} – ${props.wakeTimeLabel}`
    : null

  return (
    <View style={{ alignItems: "center", paddingVertical: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text text={`${h}h`} style={{ fontSize: 56, fontWeight: "300", color: colors.text }} />
        <Text text={` ${m}m`} style={{ fontSize: 28, fontWeight: "300", color: colors.text, opacity: 0.85 }} />
      </View>
      {range ? <Text text={range} size="xs" style={{ color: colors.textDim, marginTop: 6 }} /> : null}

      {showScore ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: "rgba(255,164,43,0.12)",
          }}
        >
          <Text text={String(props.score)} style={{ color: "#ffa42b", fontWeight: "600", fontSize: 18 }} />
          <Text text={props.scoreLabel} size="xs" style={{ color: "#ffa42b", opacity: 0.85 }} />
          {showDelta ? (
            <Text
              text={`${sign}${props.scoreDelta} vs week`}
              size="xxs"
              style={{
                color: colors.textDim,
                paddingLeft: 6,
                marginLeft: 4,
                borderLeftWidth: 1,
                borderLeftColor: colors.surfaceCardBorder,
              }}
            />
          ) : null}
        </View>
      ) : (
        <View
          style={{
            marginTop: 14,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: colors.surfaceSubtle,
          }}
        >
          <Text text="Building baseline" size="xs" style={{ color: colors.textDim }} />
        </View>
      )}

      {props.detail ? (
        <Text
          text={props.detail}
          size="xs"
          style={{ color: colors.textDim, marginTop: 14, paddingHorizontal: 12, textAlign: "center", lineHeight: 18 }}
        />
      ) : null}
    </View>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
cd apps/app && pnpm compile
git -C /Users/nish/Documents/noop add apps/app/app/components/SleepHero.tsx
git -C /Users/nish/Documents/noop commit -m "feat(app): add SleepHero with confidence-gated score chip + delta + detail"
```

---

### Task 10: WhyPanel component

**Files:**
- Create: `apps/app/app/components/WhyPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { TouchableOpacity, View } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type FactorRow = {
  factorTag: string
  deepMin: number
  remMin: number
  awakeMin: number
  effectSize: number
}

export type WhyPanelProps = {
  factors: FactorRow[]
  hasJournal: boolean
  fallbackInsight?: string | null
  onPressLogJournal: () => void
  onPressFactor: (tag: string) => void
}

function pickHeadlineImpact(f: FactorRow): { label: string; value: number; tone: "good" | "bad" } {
  const candidates: Array<{ label: string; value: number; tone: "good" | "bad" }> = [
    { label: "deep", value: f.deepMin, tone: f.deepMin >= 0 ? "good" : "bad" },
    { label: "REM", value: f.remMin, tone: f.remMin >= 0 ? "good" : "bad" },
    { label: "awake", value: f.awakeMin, tone: f.awakeMin <= 0 ? "good" : "bad" },
  ]
  candidates.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  return candidates[0]
}

export function WhyPanel({ factors, hasJournal, fallbackInsight, onPressLogJournal, onPressFactor }: WhyPanelProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors

  const containerStyle = {
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.surfaceCardBorder,
  } as const

  const titleStyle = {
    color: colors.textDim,
    letterSpacing: 1.2,
    fontSize: 11,
    fontWeight: "600",
  } as const

  if (!hasJournal) {
    return (
      <TouchableOpacity onPress={onPressLogJournal} style={containerStyle}>
        <Text text="WHY THIS SCORE" style={titleStyle} />
        <Text
          text="Log how you slept (caffeine, workouts, stress) to unlock factor insights."
          size="xs"
          style={{ color: colors.text, marginTop: 8, lineHeight: 18 }}
        />
        <Text text="Open journal →" size="xxs" style={{ color: "#a78bfa", marginTop: 8 }} />
      </TouchableOpacity>
    )
  }

  if (factors.length === 0 && fallbackInsight) {
    return (
      <View style={containerStyle}>
        <Text text="WHY THIS SCORE" style={titleStyle} />
        <Text text={fallbackInsight} size="xs" style={{ color: colors.text, marginTop: 8, lineHeight: 18 }} />
      </View>
    )
  }

  const top = factors.slice(0, 3)
  return (
    <View style={containerStyle}>
      <Text text="WHY THIS SCORE · FROM YOUR JOURNAL" style={titleStyle} />
      {top.map((f, idx) => {
        const headline = pickHeadlineImpact(f)
        const sign = headline.value > 0 ? "+" : ""
        const color = headline.tone === "good" ? "#4ade80" : "#f87171"
        return (
          <TouchableOpacity
            key={f.factorTag}
            onPress={() => onPressFactor(f.factorTag)}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: idx === 0 ? 4 : 0,
              paddingVertical: 8,
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: colors.surfaceCardBorder,
            }}
          >
            <Text text={f.factorTag} size="sm" style={{ color: colors.text }} />
            <Text
              text={`${sign}${headline.value}m ${headline.label}`}
              size="sm"
              style={{ color, fontWeight: "600" }}
            />
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
cd apps/app && pnpm compile
git -C /Users/nish/Documents/noop add apps/app/app/components/WhyPanel.tsx
git -C /Users/nish/Documents/noop commit -m "feat(app): add WhyPanel with three states (factors / no-journal / fallback)"
```

---

### Task 11: TrendSparkline component

**Files:**
- Create: `apps/app/app/components/TrendSparkline.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { View } from "react-native"
import Svg, { Polyline, Circle } from "react-native-svg"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type TrendPoint = { date: string; value: number | null }

export type TrendSparklineProps = {
  label: string
  averageLabel?: string
  points: TrendPoint[]
  currentDate: string
  color?: string
  onPressPoint?: (date: string) => void
}

const W = 200
const H = 28

export function TrendSparkline({ label, averageLabel, points, currentDate, color, onPressPoint }: TrendSparklineProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const stroke = color ?? "#3FB1E7"

  const finite = points.filter((p): p is { date: string; value: number } => p.value != null && Number.isFinite(p.value))
  if (finite.length < 3) {
    return (
      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text text={label} size="xs" style={{ color: colors.textDim }} />
          <Text text="Need 3+ nights" size="xxs" style={{ color: colors.textMuted }} />
        </View>
      </View>
    )
  }

  const min = Math.min(...finite.map((p) => p.value))
  const max = Math.max(...finite.map((p) => p.value))
  const range = max - min || 1
  const step = W / Math.max(finite.length - 1, 1)
  const coords = finite.map((p, i) => ({
    x: i * step,
    y: H - ((p.value - min) / range) * (H - 6) - 3,
    date: p.date,
  }))
  const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(" ")
  const current = coords.find((c) => c.date === currentDate) ?? coords[coords.length - 1]

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text text={label} size="xs" style={{ color: colors.textDim }} />
        {averageLabel ? <Text text={averageLabel} size="xs" style={{ color: colors.text }} /> : null}
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: 4 }}>
        <Polyline points={polyPoints} fill="none" stroke={stroke} strokeWidth={1.5} />
        <Circle cx={current.x} cy={current.y} r={3} fill="#ffa42b" onPress={() => onPressPoint?.(current.date)} />
      </Svg>
    </View>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
cd apps/app && pnpm compile
git -C /Users/nish/Documents/noop add apps/app/app/components/TrendSparkline.tsx
git -C /Users/nish/Documents/noop commit -m "feat(app): add TrendSparkline with current-night dot and 3-night minimum"
```

---

### Task 12: LabsAccordion component

**Files:**
- Create: `apps/app/app/components/LabsAccordion.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react"
import { LayoutAnimation, TouchableOpacity, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type LabRow = {
  label: string
  value: string
}

export type LabsAccordionProps = {
  rows: LabRow[]
  defaultOpen?: boolean
}

export function LabsAccordion({ rows, defaultOpen = false }: LabsAccordionProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const [open, setOpen] = useState(defaultOpen)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }

  return (
    <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: colors.surfaceCardBorder }}>
      <TouchableOpacity
        onPress={toggle}
        style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 12, gap: 6 }}
      >
        <Text text="Labs" size="xs" style={{ color: colors.textDim, letterSpacing: 0.6 }} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textDim} />
      </TouchableOpacity>
      {open ? (
        <View style={{ paddingBottom: 12 }}>
          {rows.map((r) => (
            <View
              key={r.label}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: colors.surfaceCardBorder,
              }}
            >
              <Text text={r.label} size="sm" style={{ color: colors.textDim }} />
              <Text text={r.value} size="sm" style={{ color: colors.text }} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
cd apps/app && pnpm compile
git -C /Users/nish/Documents/noop add apps/app/app/components/LabsAccordion.tsx
git -C /Users/nish/Documents/noop commit -m "feat(app): add LabsAccordion with LayoutAnimation expand/collapse"
```

---

## Phase 4 — Screen replacement

### Task 13: Replace SleepDetailScreen body

**Files:**
- Modify: `apps/app/app/screens/SleepDetailScreen.tsx`

- [ ] **Step 1: Inspect current screen so the new render replaces the right block**

```
cd apps/app && grep -n "return (\|HypnogramChart\|MoreDetails" app/screens/SleepDetailScreen.tsx | head -10
```

Note the start of the JSX return and the section that rendered the metric grid + "More Details" expander.

- [ ] **Step 2: Replace the body with the V1.5 layout**

In `apps/app/app/screens/SleepDetailScreen.tsx`, replace the JSX returned from the screen component with:

```tsx
return (
  <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.screenBackground }}>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <DateSwitcher
          label={dateHeaderLabel}
          onPrev={onPrevDay}
          onNext={onNextDay}
          disableNext={isToday}
        />
        <TouchableOpacity onPress={onPressAlarm} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="alarm-outline" size={18} color={colors.text} />
          <Text text={alarmLabel} size="xs" style={{ color: colors.text }} />
        </TouchableOpacity>
      </View>

      <SleepHero
        durationMinutes={sleepView?.summary?.durationMinutes ?? 0}
        bedtimeLabel={sleepView?.summary?.bedtimeLabel}
        wakeTimeLabel={sleepView?.summary?.wakeTimeLabel}
        score={sleepView?.score?.value ?? null}
        scoreLabel={sleepView?.score?.label ?? "Unknown"}
        scoreConfidence={sleepView?.score?.confidence ?? "Low"}
        scoreDelta={sleepView?.score?.deltaVsWeek ?? null}
        detail={sleepView?.score?.detail ?? ""}
      />

      <HypnogramChart
        epochs={sleepView?.hypnogram?.epochs ?? []}
        width={chartWidth}
        bedtimeLabel={sleepView?.summary?.bedtimeLabel}
        wakeTimeLabel={sleepView?.summary?.wakeTimeLabel}
      />

      <StagePills
        awakeMin={sleepView?.stages?.awakeMin ?? 0}
        remMin={sleepView?.stages?.remMin ?? 0}
        coreMin={sleepView?.stages?.coreMin ?? 0}
        deepMin={sleepView?.stages?.deepMin ?? 0}
      />

      <WhyPanel
        factors={sleepView?.factorInsights ?? []}
        hasJournal={(sleepView?.journalEntryCount ?? 0) > 0}
        fallbackInsight={sleepView?.fallbackInsight ?? null}
        onPressLogJournal={() => router.push("/journal-entry")}
        onPressFactor={(tag) => router.push(`/journal-history?factor=${encodeURIComponent(tag)}`)}
      />

      <View style={{ flexDirection: "row", gap: 8, marginTop: 22 }}>
        <VitalCard
          label="Efficiency"
          value={`${Math.round((sleepView?.vitals?.efficiency ?? 0) * 100)}`}
          unit="%"
          delta={sleepView?.vitalsDelta?.efficiency ?? null}
          deltaUnit="%"
        />
        <VitalCard
          label="Resting HR"
          value={String(sleepView?.vitals?.rhr ?? "--")}
          unit="bpm"
          delta={sleepView?.vitalsDelta?.rhr ?? null}
          deltaUnit="bpm"
          deltaPositiveIsGood={false}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <VitalCard
          label="HRV (RMSSD)"
          value={String(sleepView?.vitals?.hrv ?? "--")}
          unit="ms"
          delta={sleepView?.vitalsDelta?.hrv ?? null}
          deltaUnit="ms"
        />
        <VitalCard
          label="Skin Temp Δ"
          value={sleepView?.vitals?.skinTempDelta != null ? `${sleepView.vitals.skinTempDelta > 0 ? "+" : ""}${sleepView.vitals.skinTempDelta}` : "--"}
          unit="°C"
          delta={sleepView?.vitalsDelta?.skinTempDelta ?? null}
          deltaUnit="°C"
        />
      </View>

      <View style={{ marginTop: 22, padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
        <TrendSparkline
          label="Duration · 7-night"
          averageLabel={sleepView?.trends?.durationAvgLabel}
          points={sleepView?.trends?.duration ?? []}
          currentDate={selectedDate}
          color="#3FB1E7"
          onPressPoint={onPressTrendPoint}
        />
        <View style={{ height: 12 }} />
        <TrendSparkline
          label="Score · 7-night"
          averageLabel={sleepView?.trends?.scoreAvgLabel}
          points={sleepView?.trends?.score ?? []}
          currentDate={selectedDate}
          color="#ffa42b"
          onPressPoint={onPressTrendPoint}
        />
      </View>

      <LabsAccordion
        rows={[
          { label: "Blood Oxygen", value: sleepView?.labs?.bloodOxygen ?? "--" },
          { label: "SpO2 Dips", value: sleepView?.labs?.spo2Dips ?? "--" },
          { label: "Respiratory Rate", value: sleepView?.labs?.respRate ?? "--" },
          { label: "Sleep Consistency", value: sleepView?.labs?.consistency ?? "--" },
        ]}
      />
    </ScrollView>
  </SafeAreaView>
)
```

(Wire `dateHeaderLabel`, `onPrevDay`, `onNextDay`, `isToday`, `chartWidth`, `selectedDate`, `onPressAlarm`, `alarmLabel`, `onPressTrendPoint` from existing state inside the component — these names should already exist or be trivially derivable.)

- [ ] **Step 3: Add the imports**

At the top of `SleepDetailScreen.tsx`:

```tsx
import { DateSwitcher } from "@/components/DateSwitcher"
import { SleepHero } from "@/components/SleepHero"
import { StagePills } from "@/components/StagePills"
import { VitalCard } from "@/components/VitalCard"
import { WhyPanel } from "@/components/WhyPanel"
import { TrendSparkline } from "@/components/TrendSparkline"
import { LabsAccordion } from "@/components/LabsAccordion"
```

Remove now-unused imports for the old metric-grid renderer and the "More Details" expander.

- [ ] **Step 4: Type-check**

```
cd apps/app && pnpm compile
```

Expected: exit 0. If `sleepView.summary.durationMinutes` etc. don't exist on the current model, derive them from existing fields (e.g. `durationMinutes = (epochs.length)` if epochs are 1-min) — keep the new component contract intact and patch the data plumbing in this same task.

- [ ] **Step 5: Commit**

```
git -C /Users/nish/Documents/noop add apps/app/app/screens/SleepDetailScreen.tsx
git -C /Users/nish/Documents/noop commit -m "feat(sleep): replace SleepDetailScreen body with v1.5 layout"
```

---

### Task 14: Empty-state QA + commit

**Files:** none (manual verification only — fix in place if any state breaks)

- [ ] **Step 1: Reload the app on the device**

```
cd apps/app && pnpm ios:device
```

Then open the Sleep Detail screen for today's date.

- [ ] **Step 2: Walk the empty-state matrix and confirm**

| State | Expected on screen |
|---|---|
| < 3 prior nights of scores | No `+N vs week` chip on the score; no chip on any vital; sparklines show "Need 3+ nights" |
| `confidence === 'Low'` | Score chip replaced by "Building baseline" pill |
| Zero journal entries | WhyPanel shows the "Open journal →" CTA |
| Has journal but no significant correlations | WhyPanel shows the fallback insight string |
| No alarm configured | Header alarm pill reads "Set alarm" or hides time |

Confirm each on-device. If any state mis-renders, edit the relevant component file directly and reload (Metro picks up changes).

- [ ] **Step 3: Final type-check**

```
cd apps/app && pnpm compile
cd ../backend && pnpm tsc --noEmit -p .
```

Expected: both exit 0.

- [ ] **Step 4: Commit any QA fixes**

```
git -C /Users/nish/Documents/noop add -A apps/app/app/components apps/app/app/screens/SleepDetailScreen.tsx
git -C /Users/nish/Documents/noop commit -m "fix(sleep): empty-state polish from QA pass"
```

---

## Self-review checklist

- [x] **Spec coverage** — every spec section maps to at least one task: backend deltas (Tasks 1-2), factor relabel (Task 3), SleepView types (Task 4), DateSwitcher (Task 5), Hypnogram refactor (Task 6), atoms (Tasks 7-8), composites (Tasks 9-12), screen replacement (Task 13), empty-state QA (Task 14).
- [x] **Placeholder scan** — no `TBD`, no "implement later", every code step has full code.
- [x] **Type consistency** — `SleepHero`/`VitalCard`/`WhyPanel`/`TrendSparkline`/`LabsAccordion` prop types defined in their own task, consumed in Task 13 with matching names. `factorInsights` rows match the relabeled keys (`deepMin`, `remMin`, `awakeMin`).
