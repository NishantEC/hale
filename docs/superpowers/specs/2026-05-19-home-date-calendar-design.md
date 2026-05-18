# Home date-pill calendar picker

## Problem

Today the date pill on the home screen exposes only previous-day / next-day
chevron taps. Browsing more than a day or two back is tedious, and there is
no signal anywhere in the UI for which days actually have data on the
backend — users have no way to tell "did the strap collect anything on
05/13?" without navigating to that day and waiting for the empty state to
render.

## Goal

Tap the date pill body (not the chevrons) → a full-month calendar fades in
inline, with the currently selected day highlighted, today marked, and
every day with data marked as full (green bar) or partial (orange bar).
Tap any day → calendar collapses and the home view switches to that date.

## Non-goals

- Per-metric markers (separate dots for sleep, strain, etc.). Coverage is
  a single signal: full / partial / none.
- Scrolling further back than 12 months. The cap protects against
  unbounded backfill queries and keeps the UX from feeling like an archive.
- Editing data from the calendar (no long-press, no drag-to-select).
- Standalone calendar tab. This is a contextual picker, not a destination.

## User flow

1. User on home screen, date pill shows "Sun, May 17".
2. User taps the body of the pill (the date text). Pill gains a subtle
   purple-bordered open state.
3. Calendar fades in between the top strip and the rings (~200ms, slight
   downward slide). The rings + monitor cards + timeline stay in place
   below but visually dim to ~55% opacity.
4. User sees the current month. Today (05/19) has a darker tile. Selected
   day (05/17) has the accent fill. Days with data have a colored bar
   under the number.
5. User can flip months with the chevrons in the calendar header. Prev is
   disabled once 12 months back is reached.
6. Tap any day → calendar fades out, home view switches to that date,
   pill loses its open state.
7. Tap the pill body again → collapse without changing the date.

   While calendar is open, the dimmed rings/monitors below are pointer-
   events-none — taps on them do not trigger ring navigation; they
   collapse the calendar (treated as "tap outside") without changing
   the date.

## Architecture

### Backend

New read-only endpoint:

```
GET /views/coverage?from=YYYY-MM&to=YYYY-MM&timeZone=...
```

Returns:

```json
{
  "days": [
    { "date": "2026-05-17", "coverage": "partial" },
    { "date": "2026-05-18", "coverage": "full" }
  ]
}
```

Implementation in `views.service.ts` (or a new `coverage.service.ts` if
the views module grows further):

- Resolve `timeZone` via `resolveTimeZone()`.
- Convert `from` (inclusive, first of month) and `to` (last day of
  to-month, inclusive) to UTC bounds.
- Single SQL: group `raw_sensor_records` by the IST-calendar-day of
  `timestamp`, count distinct `date_trunc('minute', timestamp)` values
  per group.
- Map distinct-minute count to `coverage`:
  - `>= 1152` → `full`
  - `>= 10`   → `partial`
  - else      → `none` (omitted from response)
- 45-day in-process LRU cache keyed by `userId|tz|from|to` (TTL 60s)
  to avoid hot reloads thrashing the DB.
- Hard cap: reject `from` more than 13 months before today (server-side
  guard mirrors the client's 12-month cap, +1 month buffer).

Auth: same Bearer-token middleware as the other `/views/*` routes.

Index check: `raw_sensor_records (userId, timestamp)` already exists.

### Mobile

New components:

- `apps/app/app/components/home/HomeDateCalendar.tsx` — wraps
  `react-native-calendars`'s `<Calendar>` with our marking semantics +
  IST-aware date handling. Receives `{ selectedDate, onSelectDate,
  onClose, coverageByDate, monthCursor, onMonthCursorChange }`.
  Renders inline (no own scroll), edge-to-edge, `#1d1f23` background, no
  border. Implements the custom day component that draws the bar marker.

- Modified `apps/app/app/components/DateSwitcher.tsx` — add `onOpenCalendar`
  prop. Wrap the title text in `TouchableOpacity` that calls it. Chevrons
  keep current behavior.

- Modified `apps/app/app/screens/HomeScreen.tsx`:
  - Local state `[isCalendarOpen, setCalendarOpen]`.
  - Local state `[calendarMonthCursor, setCalendarMonthCursor]` (string,
    "YYYY-MM"), defaulting to selectedDate's month.
  - Fetch coverage for the visible month + ±1 adjacent via
    `useCoverage(monthCursor)` — TanStack-style hook backed by a new
    `apps/app/app/services/api/noopClient.ts:fetchCoverage` function.
  - Cached locally via existing `viewCache` repo to survive cold-launch.
  - Render `<HomeDateCalendar>` between the top strip and the
    `Animated.View` containing the rings, gated on `isCalendarOpen`.
  - Wrap with `Animated.View entering={FadeIn.duration(200)}
    exiting={FadeOut.duration(150)}`. Other home content stays in the
    same flexbox column — RN handles the layout shift naturally.
  - When calendar is open, set the rings/monitors wrapper's `opacity` to
    `0.55`.

- New service helper `apps/app/app/services/api/noopClient.ts`:
  - `fetchCoverage(from, to)` → uses `apiGet` with `VIEW_TIMEOUT_MS`.

- New view-cache key namespace `coverage:YYYY-MM` in `viewCache.ts`
  (no schema change — just convention).

### Library

`react-native-calendars` (Wix) — add to `apps/app/package.json` deps.
Pinned to a recent stable. Use `<Calendar>` with `dayComponent` override
for the bar marker (the built-in `dot` marking is a centered dot, not
the bar we want under the number).

## Data flow

```
HomeScreen renders DateSwitcher
  → user taps title
  → setCalendarOpen(true), setMonthCursor(currentMonth)
  → HomeDateCalendar mounts, fades in
  → useCoverage(monthCursor) reads cache; if stale or missing, fetches
    /views/coverage?from=YYYY-MM&to=YYYY-MM
  → backend computes coverage, returns days[]
  → HomeDateCalendar renders day cells with markers
  → user taps a day
  → onSelectDate(dateKey) → setSelectedDate (existing DashboardContext)
  → setCalendarOpen(false)
  → HomeDateCalendar fades out, layout collapses
```

## Error handling

- Coverage fetch fails (timeout, 5xx) → calendar still renders, but
  without bar markers. Show a tiny dim "Couldn't load coverage" line
  under the month header. The picker itself still works.
- Network offline → render whatever's in `viewCache`; same dim message
  if nothing cached.
- Future dates → enabled and tappable; home screen already handles
  "selected day is in the future" with an empty state.

## Testing

- `apps/backend/src/views/views.service.spec.ts` (extend if file exists,
  else new): coverage thresholds — at boundary (1152 min = full), just
  under (1151 = partial), 9 min = none, 10 min = partial.
- `apps/backend/src/views/views.controller.spec.ts` (or new): rejects
  `from` > 13 months old, accepts valid ranges, respects timeZone param.
- Front-end smoke test of `HomeDateCalendar` — render with mock
  `coverageByDate` map, assert correct cells get the green bar / orange
  bar / no marker. Use existing RN testing setup.

## Open questions resolved during brainstorming

- Visual style: option B (bar marker, orange-for-partial)
- Presentation: inline fade (no modal)
- Surface: same `#1d1f23` as date pill, edge-to-edge, no border
- Data source: new backend endpoint
- Cap: 12 months
- Library: `react-native-calendars`
- Coverage threshold: ≥ 80% (1152 min of 1440) = full, > 0 but < 80% =
  partial, < 10 min = none
