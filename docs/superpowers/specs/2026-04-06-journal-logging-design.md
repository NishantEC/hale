# Journal & Activity Logging Design

**Date:** 2026-04-06
**Goal:** Add WHOOP-style factor journal logging so users can track lifestyle factors and see how they correlate with sleep quality.

---

## Overview

The backend already has `JournalEntry` (factorTag, intensity, note) and a journal-sleep correlation engine. What's missing is the app UI for creating entries and a dedicated API for journal CRUD (currently journal only goes through the bulk sync endpoint).

This feature adds:
1. A dedicated journal API (GET list, POST create, DELETE)
2. A modal journal entry screen launched from the HomeScreen "+" button
3. Predefined factor categories with icons in a tap-friendly grid
4. Intensity picker (1–5) and optional note per entry
5. Today's logged entries shown as chips in the My Day section
6. Journal history accessible from My Day

**Stages:** Wake, Light, Deep, REM correlation display already exists in SleepScreen's factorInsights — no changes needed there.

---

## Section 1: Predefined Factor Categories

12 factors organized in 4 groups, displayed as a 3×4 grid:

| Group | Factor Tag | Display Name | Icon (Ionicons) | Color |
|-------|-----------|-------------|-----------------|-------|
| Substances | `caffeine` | Caffeine | cafe-outline | #F59E0B |
| Substances | `alcohol` | Alcohol | wine-outline | #F87171 |
| Substances | `melatonin` | Melatonin | moon-outline | #A78BFA |
| Supplements | `supplements` | Supplements | fitness-outline | #34D399 |
| Lifestyle | `late_meal` | Late Meal | restaurant-outline | #F59E0B |
| Lifestyle | `screen_time` | Screen Time | phone-portrait-outline | #60A5FA |
| Lifestyle | `reading` | Reading | book-outline | #34D399 |
| Wellness | `meditation` | Meditation | leaf-outline | #34D399 |
| Wellness | `exercise` | Exercise | barbell-outline | #F59E0B |
| Wellness | `stretching` | Stretching | body-outline | #A78BFA |
| Context | `stress` | High Stress | alert-circle-outline | #F87171 |
| Context | `travel` | Travel | airplane-outline | #60A5FA |

**Intensity scale:** 1 (Low) to 5 (High). Displayed as 5 tappable circles.

**factorTag format:** Snake_case strings sent to backend. These match what the correlation engine groups on.

---

## Section 2: Backend API

### `POST /journal`
Create a journal entry for the authenticated user.

**Request:**
```json
{
  "factorTag": "caffeine",
  "intensity": 3,
  "note": "afternoon coffee",
  "timestamp": "2026-04-06T14:30:00Z"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "factorTag": "caffeine",
  "intensity": 3,
  "note": "afternoon coffee",
  "timestamp": "2026-04-06T14:30:00Z",
  "createdAt": "2026-04-06T14:30:05Z"
}
```

### `GET /journal?date=2026-04-06`
List journal entries for a specific date (midnight to midnight in user's implied timezone, or just filter by date prefix).

**Response:** `200 OK`
```json
{
  "entries": [
    {
      "id": "uuid",
      "factorTag": "caffeine",
      "intensity": 3,
      "note": "afternoon coffee",
      "timestamp": "2026-04-06T14:30:00Z",
      "createdAt": "2026-04-06T14:30:05Z"
    }
  ]
}
```

### `DELETE /journal/:id`
Delete a journal entry by ID.

**Response:** `200 OK` `{ "ok": true }`

**Auth:** All endpoints use Bearer token (same as other authenticated endpoints).

**Implementation:** New `JournalController` and `JournalService` in `backend/src/journal/`. Reuses existing `JournalEntry` entity. Module already exists (`journal.module.ts`) — just needs controller and service added.

---

## Section 3: App — Journal Entry Screen (Modal)

**Screen name:** `JournalEntry` (modal, slides up from bottom)

**Layout:**
1. **Header:** "Log Factor" title + X close button
2. **Factor Grid:** 3×4 grid of factor tiles. Each tile: icon + label, 100×100, rounded, dark glass background. Selected tile gets a colored border matching its color.
3. **Intensity Picker:** Row of 5 circles labeled 1–5. Selected circle filled with factor color. Appears after factor selection.
4. **Note Input:** Single-line text input, placeholder "Add a note (optional)". Appears after factor selection.
5. **Save Button:** Full-width button, factor color background, "Log {FactorName}" text. Disabled until factor + intensity selected.

**Behavior:**
- Tap factor tile → select it (shows intensity + note)
- Tap intensity circle → select intensity
- Tap Save → POST to `/journal`, close modal, refresh HomeScreen entries
- Tap X → close modal without saving

**Navigation:** Registered as modal in AppNavigator with `slide_from_bottom` animation.

---

## Section 4: App — HomeScreen Integration

### "+" Button
Currently navigates to HomeDetails. Change to navigate to JournalEntry modal.

### Today's Entries (new section in My Day)
Below the "My Day" header, above action rows, show today's logged factors as horizontal scrollable chips:

```
[☕ Caffeine 3] [🍷 Alcohol 2] [💊 Melatonin 4]
```

Each chip: icon + factor name + intensity number. Factor color as left border or background tint. Tap chip → could delete (long press) or just view.

If no entries today, show nothing (no empty state — the "+" button is the CTA).

### "Journal history" Action Row
Add a third action row in My Day: "Journal history" with `journal-outline` icon. Navigates to a simple list screen showing recent entries grouped by date.

---

## Section 5: App — Journal History Screen

**Screen name:** `JournalHistory` (push navigation)

**Layout:**
- Date-grouped list of journal entries (most recent first)
- Each entry row: factor icon + name + intensity dots + note preview + timestamp
- Swipe left to delete (or long-press → delete confirmation)
- Pull to refresh

**Data source:** `GET /journal?date=YYYY-MM-DD` for each visible date, or a new `GET /journal/recent?days=14` endpoint.

**Simplification:** For v1, just fetch today's entries. History can be expanded later.

---

## Section 6: API Client Updates

Add to `noopClient.ts`:

```typescript
export interface JournalEntryResponse {
  id: string;
  factorTag: string;
  intensity: number;
  note: string;
  timestamp: string;
  createdAt: string;
}

export async function createJournalEntry(entry: {
  factorTag: string;
  intensity: number;
  note?: string;
  timestamp?: string;
}): Promise<JournalEntryResponse> {
  return apiPost('/journal', {
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  });
}

export async function fetchJournalEntries(date: string): Promise<{ entries: JournalEntryResponse[] }> {
  return apiGet(`/journal?date=${encodeURIComponent(date)}`);
}

export async function deleteJournalEntry(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/journal/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: withBaseHeaders({ Authorization: `Bearer ${sessionToken}` }),
  });
}
```

---

## File Structure

**New files:**
- `backend/src/journal/journal.controller.ts` — REST endpoints
- `backend/src/journal/journal.service.ts` — business logic
- `app/app/screens/JournalEntryScreen.tsx` — modal factor picker + intensity + save
- `app/app/screens/JournalHistoryScreen.tsx` — list of recent entries

**Modified files:**
- `backend/src/journal/journal.module.ts` — register controller + service
- `app/app/services/api/noopClient.ts` — add journal API functions
- `app/app/navigators/navigationTypes.ts` — add JournalEntry + JournalHistory routes
- `app/app/navigators/AppNavigator.tsx` — register new screens
- `app/app/screens/HomeScreen.tsx` — "+" button → JournalEntry, add today's entries chips

**No changes to:**
- Journal entity (already complete)
- Sync service (still works for bulk operations)
- Journal correlations engine (already groups by factorTag)
- SleepScreen factor insights (already displays correlations)
