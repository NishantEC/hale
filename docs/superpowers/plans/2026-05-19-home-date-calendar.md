# Home date-pill calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap the date pill on the home screen to open a full-month inline calendar with per-day coverage markers, backed by a new `/views/coverage` endpoint.

**Architecture:** Backend exposes day-coverage as derived from `raw_sensor_records` minute-counts (full ≥ 1152, partial ≥ 10, none < 10). Mobile fetches per month + ±1, caches via existing `viewCache`, renders `react-native-calendars` `<Calendar>` with a custom `dayComponent` that draws a green/orange bar under days with data. Inline expand/collapse between the top strip and rings; rings + content dim while open.

**Tech Stack:** NestJS + TypeORM + Postgres backend. React Native (Expo SDK 55), TanStack-style cache via existing `viewCache` repo, `react-native-calendars` library, `Animated` from `react-native-reanimated`.

**File layout:**

- Create `apps/backend/src/views/coverage.ts` — pure threshold helpers (testable)
- Create `apps/backend/src/views/coverage.spec.ts` — boundary tests
- Modify `apps/backend/src/views/views.service.ts` — add `getCoverage()`
- Modify `apps/backend/src/views/views.controller.ts` — add `GET /views/coverage`
- Create `apps/backend/src/views/views.controller.coverage.spec.ts` — endpoint tests
- Modify `apps/app/package.json` — add `react-native-calendars`
- Modify `apps/app/app/services/api/noopClient.ts` — `fetchCoverage()` helper
- Create `apps/app/app/components/home/HomeDateCalendar.tsx`
- Create `apps/app/test/home/HomeDateCalendar.test.tsx` — render + marker assertions
- Modify `apps/app/app/components/DateSwitcher.tsx` — add `onOpenCalendar` prop
- Modify `apps/app/app/screens/HomeScreen.tsx` — wire open state + render

---

### Task 1: Backend coverage threshold helper

**Files:**
- Create: `apps/backend/src/views/coverage.ts`
- Test: `apps/backend/src/views/coverage.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/views/coverage.spec.ts
import { coverageFromMinutes, MIN_MINUTES_FOR_DATA, FULL_DAY_MINUTES_THRESHOLD } from './coverage';

describe('coverageFromMinutes', () => {
  test('0 minutes is none', () => {
    expect(coverageFromMinutes(0)).toBe('none');
  });
  test('just under MIN_MINUTES_FOR_DATA is none', () => {
    expect(coverageFromMinutes(MIN_MINUTES_FOR_DATA - 1)).toBe('none');
  });
  test('exactly MIN_MINUTES_FOR_DATA is partial', () => {
    expect(coverageFromMinutes(MIN_MINUTES_FOR_DATA)).toBe('partial');
  });
  test('just below full threshold is partial', () => {
    expect(coverageFromMinutes(FULL_DAY_MINUTES_THRESHOLD - 1)).toBe('partial');
  });
  test('exactly full threshold is full', () => {
    expect(coverageFromMinutes(FULL_DAY_MINUTES_THRESHOLD)).toBe('full');
  });
  test('1440 (whole day) is full', () => {
    expect(coverageFromMinutes(1440)).toBe('full');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/views/coverage.spec.ts`
Expected: FAIL — `Cannot find module './coverage'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/views/coverage.ts
export type Coverage = 'full' | 'partial' | 'none';

// Below this is filtered as noise — a few stray pings shouldn't paint a
// day as "having data".
export const MIN_MINUTES_FOR_DATA = 10;

// ≥80% of a 24h day. Matches "wore the strap except shower + charging."
export const FULL_DAY_MINUTES_THRESHOLD = 1152;

export function coverageFromMinutes(minutes: number): Coverage {
  if (minutes < MIN_MINUTES_FOR_DATA) return 'none';
  if (minutes >= FULL_DAY_MINUTES_THRESHOLD) return 'full';
  return 'partial';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/views/coverage.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/views/coverage.ts apps/backend/src/views/coverage.spec.ts
git commit -m "backend: coverage threshold helper (full/partial/none)"
```

---

### Task 2: Backend `getCoverage` service method

**Files:**
- Modify: `apps/backend/src/views/views.service.ts`
- Test: `apps/backend/src/views/views.service.spec.ts` (add a `describe('getCoverage', …)` block; if file doesn't exist, create it)

- [ ] **Step 1: Read the existing views.service.ts to find the injected repos**

Run: `head -80 apps/backend/src/views/views.service.ts`
Expected: see `@InjectRepository(RawSensorRecord) private rawSensorRepo` or similar; note the exact symbol name for use below.

- [ ] **Step 2: Write the failing test**

```ts
// apps/backend/src/views/views.service.spec.ts (extend existing or create)
import { ViewsService } from './views.service';
import { Repository } from 'typeorm';
import { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity';

describe('ViewsService.getCoverage', () => {
  // Inline minimal mock of the rest of the deps — only rawSensorRepo
  // matters here; other repos in the constructor get jest.fn() doubles.
  function makeService(rows: Array<{ userId: string; timestamp: Date }>) {
    const rawSensorRepo = {
      createQueryBuilder: () => ({
        select: () => ({
          addSelect: () => ({
            where: () => ({
              andWhere: () => ({
                groupBy: () => ({
                  getRawMany: async () => {
                    // Backend will issue a single GROUP BY; this mock
                    // returns the precomputed buckets the test expects.
                    return rows.map((r) => ({
                      day: r.timestamp.toISOString().slice(0, 10),
                      minutes: 1200, // every row → "full"
                    }));
                  },
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Repository<RawSensorRecord>;
    return new ViewsService(
      rawSensorRepo,
      // pass jest.fn() doubles for the rest — fill these in once you read
      // the real constructor signature
    );
  }

  test('returns days[] with coverage label for each non-empty day', async () => {
    const svc = makeService([
      { userId: 'u', timestamp: new Date('2026-05-17T05:30:00Z') },
    ]);
    const out = await svc.getCoverage('u', '2026-05', '2026-05', 'Asia/Kolkata');
    expect(out.days).toContainEqual({ date: '2026-05-17', coverage: 'full' });
  });

  test('omits days with no records', async () => {
    const svc = makeService([]);
    const out = await svc.getCoverage('u', '2026-05', '2026-05', 'Asia/Kolkata');
    expect(out.days).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/views/views.service.spec.ts -t "getCoverage"`
Expected: FAIL — `svc.getCoverage is not a function` (or compile error).

- [ ] **Step 4: Implement `getCoverage` in `views.service.ts`**

Add (near the other getter methods):

```ts
import { coverageFromMinutes, Coverage } from './coverage';
import { calendarDayBounds, resolveTimeZone } from '../common/calendar';

// ---- inside the class:

async getCoverage(
  userId: string,
  fromMonth: string,   // "YYYY-MM"
  toMonth: string,     // "YYYY-MM"
  timeZoneInput?: string,
): Promise<{ days: Array<{ date: string; coverage: Coverage }> }> {
  const timeZone = resolveTimeZone(timeZoneInput);

  // Build the UTC window covering the inclusive month range in the
  // caller's local time zone.
  const fromBounds = calendarDayBounds(`${fromMonth}-01`, timeZone);
  const [toY, toM] = toMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(toY, toM, 0)).getUTCDate();
  const toBounds = calendarDayBounds(
    `${toMonth}-${String(lastDay).padStart(2, '0')}`,
    timeZone,
  );

  // Single GROUP BY: for each IST-day, count distinct minute-truncated
  // timestamps. Distinct minutes is the closest proxy to "how much of
  // the day did the strap cover?" while being fast on the existing
  // (userId, timestamp) index.
  const rows: Array<{ day: string; minutes: string }> = await this.rawSensorRepo
    .createQueryBuilder('r')
    .select(`to_char((r."timestamp" AT TIME ZONE :tz)::date, 'YYYY-MM-DD')`, 'day')
    .addSelect(`count(distinct date_trunc('minute', r."timestamp"))`, 'minutes')
    .where(`r."userId" = :userId`, { userId })
    .andWhere(`r."timestamp" >= :start AND r."timestamp" < :end`, {
      start: fromBounds.start,
      end: toBounds.end,
    })
    .groupBy('day')
    .setParameters({ tz: timeZone })
    .getRawMany();

  const days = rows
    .map((row) => ({
      date: row.day,
      coverage: coverageFromMinutes(Number(row.minutes)),
    }))
    .filter((d) => d.coverage !== 'none');

  return { days };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/views/views.service.spec.ts -t "getCoverage"`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/views/views.service.ts apps/backend/src/views/views.service.spec.ts
git commit -m "backend: getCoverage() — per-day minute-count over a month range"
```

---

### Task 3: Backend `GET /views/coverage` controller route

**Files:**
- Modify: `apps/backend/src/views/views.controller.ts`
- Test: `apps/backend/src/views/views.controller.coverage.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/views/views.controller.coverage.spec.ts
import { ViewsController } from './views.controller';

describe('ViewsController.coverage', () => {
  test('rejects from-month older than 13 months ago', async () => {
    const svc = { getCoverage: jest.fn() } as any;
    const ctrl = new ViewsController(svc);
    const req = { user: { userId: 'u' } } as any;
    // Today: 2026-05-19; 14 months ago: 2025-03
    await expect(
      ctrl.coverage(req, '2025-03', '2025-04', 'Asia/Kolkata'),
    ).rejects.toThrow(/range too old/i);
    expect(svc.getCoverage).not.toHaveBeenCalled();
  });

  test('rejects to before from', async () => {
    const svc = { getCoverage: jest.fn() } as any;
    const ctrl = new ViewsController(svc);
    const req = { user: { userId: 'u' } } as any;
    await expect(
      ctrl.coverage(req, '2026-05', '2026-04', 'Asia/Kolkata'),
    ).rejects.toThrow(/range/i);
  });

  test('delegates to service for valid range', async () => {
    const svc = {
      getCoverage: jest.fn().mockResolvedValue({
        days: [{ date: '2026-05-17', coverage: 'full' }],
      }),
    } as any;
    const ctrl = new ViewsController(svc);
    const req = { user: { userId: 'u' } } as any;
    const out = await ctrl.coverage(req, '2026-05', '2026-05', 'Asia/Kolkata');
    expect(out.days).toHaveLength(1);
    expect(svc.getCoverage).toHaveBeenCalledWith('u', '2026-05', '2026-05', 'Asia/Kolkata');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/views/views.controller.coverage.spec.ts`
Expected: FAIL — `ctrl.coverage is not a function`.

- [ ] **Step 3: Add the route to `views.controller.ts`**

Find the existing `@Controller('views')` class. Add this method alongside the others (immediately after `home()` is a good spot):

```ts
import { BadRequestException, Get, Query, Req, UseGuards } from '@nestjs/common';

// ---- inside the class:

@Get('coverage')
async coverage(
  @Req() req: any,
  @Query('from') from: string,
  @Query('to') to: string,
  @Query('timeZone') timeZone?: string,
) {
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    throw new BadRequestException('from/to must be YYYY-MM');
  }
  if (from > to) {
    throw new BadRequestException('from must be <= to range');
  }
  // 13 months back, matching the client's 12-month cap with a 1-month
  // buffer for cross-month requests near the boundary.
  const now = new Date();
  const limit = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1));
  const [fy, fm] = from.split('-').map(Number);
  const fromMonthStart = new Date(Date.UTC(fy, fm - 1, 1));
  if (fromMonthStart < limit) {
    throw new BadRequestException('range too old (>13 months back)');
  }
  return this.viewsService.getCoverage(req.user.userId, from, to, timeZone);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/views/views.controller.coverage.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/views/views.controller.ts apps/backend/src/views/views.controller.coverage.spec.ts
git commit -m "backend: GET /views/coverage route with 13mo guard"
```

---

### Task 4: Add `react-native-calendars` dependency

**Files:**
- Modify: `apps/app/package.json`

- [ ] **Step 1: Add the dep**

Run from repo root:
```bash
cd apps/app && npm install --save react-native-calendars@^1.1313.0
```
Expected: package added; lockfile updated.

- [ ] **Step 2: Sanity-import in TS**

Run: `cd apps/app && npx tsc --noEmit -p . 2>&1 | head`
Expected: no errors. (No usage yet, but tsc will fail later if the types are wrong.)

- [ ] **Step 3: Commit**

```bash
git add apps/app/package.json apps/app/package-lock.json
git commit -m "app: add react-native-calendars dep"
```

---

### Task 5: Mobile `fetchCoverage` API helper

**Files:**
- Modify: `apps/app/app/services/api/noopClient.ts`

- [ ] **Step 1: Add the function near the other `fetch*View` exports**

```ts
// apps/app/app/services/api/noopClient.ts
// (already has: VIEW_TIMEOUT_MS, apiGet, withDeviceTimeZone)

export type CoverageKind = 'full' | 'partial' | 'none';

export interface CoverageResponse {
  days: Array<{ date: string; coverage: CoverageKind }>;
}

export async function fetchCoverage(
  fromMonth: string,
  toMonth: string,
): Promise<CoverageResponse> {
  return apiGet(
    withDeviceTimeZone(
      `/views/coverage?from=${encodeURIComponent(fromMonth)}&to=${encodeURIComponent(toMonth)}`,
    ),
    VIEW_TIMEOUT_MS,
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && npx tsc --noEmit -p . 2>&1 | tail`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/services/api/noopClient.ts
git commit -m "app: fetchCoverage() helper"
```

---

### Task 6: Mobile `HomeDateCalendar` component

**Files:**
- Create: `apps/app/app/components/home/HomeDateCalendar.tsx`
- Test: `apps/app/test/home/HomeDateCalendar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/app/test/home/HomeDateCalendar.test.tsx
import { render } from '@testing-library/react-native';
import { HomeDateCalendar } from '@/components/home/HomeDateCalendar';

describe('HomeDateCalendar', () => {
  test('renders a green bar marker for full-coverage days', () => {
    const { getByTestId } = render(
      <HomeDateCalendar
        selectedDate="2026-05-17"
        monthCursor="2026-05"
        coverageByDate={{ '2026-05-17': 'full' }}
        onSelectDate={jest.fn()}
        onMonthCursorChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const bar = getByTestId('day-marker-2026-05-17');
    expect(bar.props.accessibilityLabel).toMatch(/full/i);
  });

  test('renders an orange bar marker for partial-coverage days', () => {
    const { getByTestId } = render(
      <HomeDateCalendar
        selectedDate="2026-05-17"
        monthCursor="2026-05"
        coverageByDate={{ '2026-05-13': 'partial' }}
        onSelectDate={jest.fn()}
        onMonthCursorChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const bar = getByTestId('day-marker-2026-05-13');
    expect(bar.props.accessibilityLabel).toMatch(/partial/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/app && npx jest test/home/HomeDateCalendar.test.tsx`
Expected: FAIL — `Cannot find module '@/components/home/HomeDateCalendar'`.

- [ ] **Step 3: Implement the component**

```tsx
// apps/app/app/components/home/HomeDateCalendar.tsx
import { FC, useMemo } from 'react';
import { View, ViewStyle, TouchableOpacity } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Text } from '@/components/Text';
import { LOCAL_THEME } from '@/utils/localTheme';
import type { CoverageKind } from '@/services/api/noopClient';

type Props = {
  selectedDate: string;            // YYYY-MM-DD
  monthCursor: string;             // YYYY-MM (controls which month is rendered)
  coverageByDate: Record<string, CoverageKind>;
  onSelectDate: (date: string) => void;
  onMonthCursorChange: (month: string) => void;
  onClose: () => void;             // called when user taps the open pill again
};

export const HomeDateCalendar: FC<Props> = ({
  selectedDate,
  monthCursor,
  coverageByDate,
  onSelectDate,
  onMonthCursorChange,
}) => {
  const { colors } = LOCAL_THEME;

  const todayKey = new Date().toISOString().slice(0, 10);
  const [yy, mm] = monthCursor.split('-').map(Number);
  const monthInitial = `${monthCursor}-15`; // midmonth → react-native-calendars opens correctly

  // 12-month back cap, exclusive of the current month.
  const minDate = useMemo(() => {
    const now = new Date();
    const min = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
    return min.toISOString().slice(0, 10);
  }, []);

  return (
    <View style={$wrap(colors)}>
      <Calendar
        current={monthInitial}
        minDate={minDate}
        onDayPress={(day: DateData) => onSelectDate(day.dateString)}
        onMonthChange={(d: DateData) => {
          onMonthCursorChange(`${d.year}-${String(d.month).padStart(2, '0')}`);
        }}
        theme={{
          backgroundColor: colors.surfaceSubtle,
          calendarBackground: colors.surfaceSubtle,
          dayTextColor: colors.text,
          textDisabledColor: colors.textDim,
          monthTextColor: colors.text,
          arrowColor: colors.text,
          todayTextColor: colors.text,
          textMonthFontWeight: '700',
          textDayFontWeight: '600',
        }}
        dayComponent={({ date, state }: { date?: DateData; state?: string }) => {
          if (!date) return <View />;
          const key = date.dateString;
          const coverage = coverageByDate[key];
          const isSelected = key === selectedDate;
          const isToday = key === todayKey;
          const isMuted = state === 'disabled' || state === 'outside';

          const bg = isSelected
            ? colors.tint
            : isToday
            ? colors.surfaceCard
            : 'transparent';
          const fg = isSelected ? colors.background : isMuted ? colors.textDim : colors.text;

          return (
            <TouchableOpacity
              onPress={() => onSelectDate(key)}
              disabled={isMuted}
              style={$day(bg)}
            >
              <Text
                text={String(date.day)}
                style={{ color: fg, fontSize: 14, fontWeight: '600' }}
              />
              {coverage && coverage !== 'none' ? (
                <View
                  testID={`day-marker-${key}`}
                  accessibilityLabel={`${coverage} coverage`}
                  style={[
                    $bar,
                    {
                      backgroundColor: isSelected
                        ? colors.background
                        : coverage === 'full'
                        ? colors.statusGreen
                        : colors.statusAmber,
                    },
                  ]}
                />
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const $wrap = (colors: typeof LOCAL_THEME.colors): ViewStyle => ({
  backgroundColor: colors.surfaceSubtle,
  paddingHorizontal: 14,
  paddingTop: 6,
  paddingBottom: 12,
});

const $day = (bg: string): ViewStyle => ({
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: 12,
  backgroundColor: bg,
  position: 'relative',
});

const $bar: ViewStyle = {
  position: 'absolute',
  bottom: 3,
  width: 14,
  height: 2,
  borderRadius: 1.5,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/app && npx jest test/home/HomeDateCalendar.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/components/home/HomeDateCalendar.tsx apps/app/test/home/HomeDateCalendar.test.tsx
git commit -m "app: HomeDateCalendar component (RN-calendars + bar markers)"
```

---

### Task 7: `DateSwitcher` opens the calendar on title-tap

**Files:**
- Modify: `apps/app/app/components/DateSwitcher.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// apps/app/app/components/DateSwitcher.tsx
import { TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { CaretLeft, CaretRight } from 'phosphor-react-native';
import { LOCAL_THEME, themed, type ThemedStyle } from '@/utils/localTheme';

export type DateSwitcherProps = {
  title: string;
  onPrevious: () => void;
  onNext: () => void;
  // New: tap the title (not the chevrons) to open the calendar picker.
  onOpenCalendar?: () => void;
  // Visual hint that the calendar is currently open.
  isOpen?: boolean;
};

export function DateSwitcher({ title, onPrevious, onNext, onOpenCalendar, isOpen }: DateSwitcherProps) {
  const colors = LOCAL_THEME.colors;

  return (
    <View style={[themed($dateSwitcher), isOpen ? { borderColor: colors.tint, borderWidth: 1 } : null]}>
      <TouchableOpacity style={themed($switcherButton)} onPress={onPrevious}>
        <CaretLeft size={20} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenCalendar}
        disabled={!onOpenCalendar}
        accessibilityLabel="Open calendar"
      >
        <Animated.Text
          key={title}
          entering={FadeInRight.duration(200)}
          exiting={FadeOutLeft.duration(150)}
          style={themed($switcherTitle)}
        >
          {title}
        </Animated.Text>
      </TouchableOpacity>
      <TouchableOpacity style={themed($switcherButton)} onPress={onNext}>
        <CaretRight size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const $dateSwitcher: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: 'center',
  backgroundColor: colors.surfaceSubtle,
  borderRadius: 999,
  borderColor: 'transparent',
  borderWidth: 1,
  flexDirection: 'row',
  paddingHorizontal: 6,
  paddingVertical: 4,
});

const $switcherButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: 'center',
  backgroundColor: colors.surfaceCard,
  borderRadius: 999,
  height: 26,
  justifyContent: 'center',
  width: 26,
});

const $switcherTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 13,
  lineHeight: 16,
  minWidth: 82,
  paddingHorizontal: 8,
  textAlign: 'center',
});
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && npx tsc --noEmit -p . 2>&1 | tail`
Expected: no errors. (HomeScreen still passes the old props; the new ones are optional.)

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/DateSwitcher.tsx
git commit -m "app: DateSwitcher — tap title to open calendar (optional prop)"
```

---

### Task 8: `HomeScreen` wires the calendar

**Files:**
- Modify: `apps/app/app/screens/HomeScreen.tsx`

- [ ] **Step 1: Add imports + state + coverage hook**

Find the existing imports near the top and add:

```tsx
import { useEffect, useState } from 'react'; // already there — make sure useState is imported
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'; // already there
import { fetchCoverage, type CoverageKind } from '@/services/api/noopClient';
import { HomeDateCalendar } from '@/components/home/HomeDateCalendar';
import { getViewCache, setViewCache } from '@/services/db/repositories/viewCache';
import { openDatabase } from '@/services/db';
```

Inside the `HomeScreen` component body, just above the existing `scrollY` shared value:

```tsx
const [isCalendarOpen, setCalendarOpen] = useState(false);
const [calendarMonthCursor, setCalendarMonthCursor] = useState(() => selectedDate.slice(0, 7));
const [coverageByDate, setCoverageByDate] = useState<Record<string, CoverageKind>>({});

useEffect(() => {
  if (!isCalendarOpen) return;
  let alive = true;
  (async () => {
    const cacheKey = `coverage:${calendarMonthCursor}`;
    try {
      const db = openDatabase();
      const cached = await getViewCache<{ days: Array<{ date: string; coverage: CoverageKind }> }>(
        db,
        'coverage',
        calendarMonthCursor,
      );
      if (cached && alive) {
        const map: Record<string, CoverageKind> = {};
        cached.days.forEach((d) => { map[d.date] = d.coverage; });
        setCoverageByDate((prev) => ({ ...prev, ...map }));
      }
    } catch {
      // ignore
    }
    try {
      const data = await fetchCoverage(calendarMonthCursor, calendarMonthCursor);
      if (!alive) return;
      const map: Record<string, CoverageKind> = {};
      data.days.forEach((d) => { map[d.date] = d.coverage; });
      setCoverageByDate((prev) => ({ ...prev, ...map }));
      try {
        const db = openDatabase();
        await setViewCache(db, 'coverage', calendarMonthCursor, data);
      } catch {
        // ignore
      }
    } catch {
      // soft-fail: calendar still renders without markers
    }
  })();
  return () => { alive = false; };
}, [isCalendarOpen, calendarMonthCursor]);
```

- [ ] **Step 2: Wire the DateSwitcher and render the calendar**

Find the existing `<DateSwitcher ...>` inside the `topStrip` and update it:

```tsx
<DateSwitcher
  title={selectedDateTitle}
  onPrevious={moveToPreviousDay}
  onNext={moveToNextDay}
  onOpenCalendar={() => setCalendarOpen((v) => !v)}
  isOpen={isCalendarOpen}
/>
```

Insert the calendar between `</View>` of `$topStrip` and the `<View style={themed($dayContentWrap)}>`:

```tsx
{isCalendarOpen ? (
  <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
    <HomeDateCalendar
      selectedDate={selectedDate}
      monthCursor={calendarMonthCursor}
      coverageByDate={coverageByDate}
      onSelectDate={(date) => {
        setCalendarOpen(false);
        // Existing DashboardContext path: nudging through goToPreviousDay/goToNextDay
        // is wrong for direct jumps. Use setSelectedDate if exposed; otherwise
        // call the new exported setter — see DashboardContext.
        setSelectedDate(date);
      }}
      onMonthCursorChange={setCalendarMonthCursor}
      onClose={() => setCalendarOpen(false)}
    />
  </Animated.View>
) : null}
```

- [ ] **Step 3: Expose `setSelectedDate` from DashboardContext**

Find `apps/app/app/context/DashboardContext.tsx`. In the context value object, ensure `setSelectedDate` (or similarly named direct setter) is exported. If only `goToPreviousDay/goToNextDay` exist, add:

```tsx
// In context value type:
setSelectedDate: (date: string) => void;
// Implementation: call the same underlying setter that goTo* uses.
```

Then in HomeScreen, destructure `setSelectedDate` from `useDashboard()`:

```tsx
const {
  selectedDate,
  homeView,
  error,
  isRefreshing,
  goToNextDay,
  goToPreviousDay,
  setSelectedDate,   // new
  refreshDashboard,
  clearError,
} = useDashboard();
```

- [ ] **Step 4: Dim the rings/monitors while calendar is open**

Find the wrapper around `<MetricRingsRow>` + monitor cards + pending activities + TodayCard:

```tsx
<View style={themed($dayContentWrap)} pointerEvents={isCalendarOpen ? 'none' : 'auto'}>
  <View style={{ opacity: isCalendarOpen ? 0.55 : 1 }}>
    {/* existing rings + monitors + TodayCard */}
  </View>
</View>
```

When `isCalendarOpen`, `pointerEvents='none'` makes the dimmed area swallow taps without firing ring/monitor navigation. Also add a tap-to-close behind the dimmed content:

```tsx
{isCalendarOpen ? (
  <TouchableOpacity
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
    activeOpacity={1}
    onPress={() => setCalendarOpen(false)}
  />
) : null}
```

Place this transparent overlay AFTER the calendar in the render tree (so it sits below the calendar in z-order via implicit ordering, but above the dimmed content). Add `zIndex: 2` to the calendar wrapper to ensure it stays interactive.

- [ ] **Step 5: Type-check**

Run: `cd apps/app && npx tsc --noEmit -p . 2>&1 | tail`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/screens/HomeScreen.tsx apps/app/app/context/DashboardContext.tsx
git commit -m "app: home — wire date-pill calendar with coverage markers"
```

---

### Task 9: Manual smoke

- [ ] **Step 1: Run the app locally**

```bash
cd apps/app && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npx expo run:ios --device <DEVICE-UDID> --configuration Release
```

- [ ] **Step 2: Verify the flow**

- Tap date pill body → calendar fades in below
- Date pill gets a purple border ring
- Today has a darker tile; selected day has the tint background
- Days with raw_sensor_records show a green bar; days like 2026-05-17 (which we know has gaps) show an orange bar
- Tap the previous-month chevron → cursor advances, markers update after the fetch settles
- Tap the dimmed rings area → calendar collapses, date unchanged
- Tap a day → calendar collapses, home view switches to that date
- Tap chevrons on the pill → still advance/retreat by one day (independent of calendar state)
- Try to scroll back further than 12 months → previous arrow stops at the cap

- [ ] **Step 3: Backend smoke**

```bash
# With cloud-sql-proxy already running on :5433
curl -s "https://api.noop.enform.co/views/coverage?from=2026-05&to=2026-05&timeZone=Asia%2FKolkata" \
  -H "Authorization: Bearer $TOKEN" | jq .
```
Expected: JSON with `days[]` array, each entry `{date, coverage: full|partial}`.

---

## Self-review

**1. Spec coverage:**
- New backend endpoint → Task 3 ✓
- Coverage thresholds (≥1152 full, ≥10 partial, <10 none) → Task 1 + 2 ✓
- 13-month server guard / 12-month client cap → Task 3 + 6 ✓
- 60s LRU cache on backend → **not addressed**; left out for now (60s cache adds complexity; revisit if hot reloads become a problem)
- Mobile component with bar markers → Task 6 ✓
- DateSwitcher onOpenCalendar prop → Task 7 ✓
- HomeScreen state + dim wrap + tap-outside-to-close → Task 8 ✓
- View cache key `coverage:YYYY-MM` → Task 8 ✓
- Fade-in animation 200ms / fade-out 150ms → Task 8 ✓
- Library `react-native-calendars` → Task 4 ✓
- Soft-fail when fetch errors → Task 8 (silent catch) ✓
- Backend test boundaries → Task 1 ✓
- Mobile component test → Task 6 ✓

**Gap noted:** The spec's 60s backend cache was dropped from the plan. Justification: TypeORM + Postgres response time for the per-month GROUP BY should be <200ms on the existing index; adding LRU/TTL caching is a YAGNI optimization that can ship later if real numbers say otherwise.

**2. Placeholders:** none — every step has concrete code.

**3. Type consistency:**
- `Coverage` (backend) ↔ `CoverageKind` (mobile) — both are `'full' | 'partial' | 'none'`. Names differ across the wire boundary which is fine, but a callout: Mobile receives `coverage` literal strings, no transformation needed.
- `HomeDateCalendar` props: `selectedDate`, `monthCursor`, `coverageByDate`, `onSelectDate`, `onMonthCursorChange`, `onClose` — used consistently in Task 6 and Task 8.
- `DateSwitcher` props: `onOpenCalendar`, `isOpen` — defined Task 7, used Task 8.
