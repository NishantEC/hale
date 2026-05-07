# Journal & Activity Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WHOOP-style factor journal logging — predefined lifestyle factors, quick-tap entry, intensity rating, and integration with the existing sleep correlation engine.

**Architecture:** Backend gets a dedicated JournalController with GET/POST/DELETE endpoints (reusing existing JournalEntry entity). App gets a modal JournalEntryScreen with a factor grid + intensity picker, and HomeScreen shows today's logged entries as chips.

**Tech Stack:** NestJS (backend), React Native + react-native-svg (app), TypeORM, Ionicons

---

### Task 1: Backend Journal Service & Controller

**Files:**
- Create: `backend/src/journal/journal.service.ts`
- Create: `backend/src/journal/journal.controller.ts`
- Modify: `backend/src/journal/journal.module.ts`

- [ ] **Step 1: Create journal.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { JournalEntry } from './journal-entry.entity.js';

@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntry)
    private repo: Repository<JournalEntry>,
  ) {}

  async create(userId: string, data: { factorTag: string; intensity: number; note?: string; timestamp?: string }): Promise<JournalEntry> {
    const entry = this.repo.create({
      userId,
      factorTag: data.factorTag,
      intensity: data.intensity,
      note: data.note ?? '',
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    });
    return this.repo.save(entry);
  }

  async findByDate(userId: string, date: string): Promise<JournalEntry[]> {
    const start = new Date(`${date}T00:00:00Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    return this.repo.find({
      where: { userId, timestamp: Between(start, end) },
      order: { timestamp: 'DESC' },
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }
}
```

- [ ] **Step 2: Create journal.controller.ts**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/auth.guard.js';
import { JournalService } from './journal.service.js';

@Controller('journal')
@UseGuards(SessionGuard)
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { factorTag: string; intensity: number; note?: string; timestamp?: string },
  ) {
    if (!body.factorTag || typeof body.intensity !== 'number') {
      throw new HttpException('factorTag and intensity are required', HttpStatus.BAD_REQUEST);
    }
    return this.journalService.create(req.user.userId, body);
  }

  @Get()
  async list(@Req() req: any, @Query('date') date?: string) {
    const dateStr = date ?? new Date().toISOString().slice(0, 10);
    const entries = await this.journalService.findByDate(req.user.userId, dateStr);
    return { entries };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const deleted = await this.journalService.remove(req.user.userId, id);
    if (!deleted) {
      throw new HttpException('Entry not found', HttpStatus.NOT_FOUND);
    }
    return { ok: true };
  }
}
```

- [ ] **Step 3: Update journal.module.ts to register controller and service**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './journal-entry.entity.js';
import { JournalService } from './journal.service.js';
import { JournalController } from './journal.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry])],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [TypeOrmModule, JournalService],
})
export class JournalModule {}
```

- [ ] **Step 4: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/journal/journal.service.ts backend/src/journal/journal.controller.ts backend/src/journal/journal.module.ts
git commit -m "feat: add dedicated journal CRUD API endpoints"
```

---

### Task 2: App API Client — Journal Functions

**Files:**
- Modify: `app/app/services/api/noopClient.ts`

- [ ] **Step 1: Add journal types and API functions to noopClient.ts**

Add after the existing exports at the end of the file:

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

Note: `deleteJournalEntry` uses `requestJson` directly because `apiPost`/`apiGet` don't support DELETE. The `requestJson` function and `sessionToken` and `withBaseHeaders` are already available in the file scope.

- [ ] **Step 2: Commit**

```bash
git add app/app/services/api/noopClient.ts
git commit -m "feat: add journal API client functions"
```

---

### Task 3: Navigation Setup — Journal Screens

**Files:**
- Modify: `app/app/navigators/navigationTypes.ts`
- Modify: `app/app/navigators/AppNavigator.tsx`

- [ ] **Step 1: Add JournalEntry and JournalHistory to AppStackParamList in navigationTypes.ts**

Add to the `AppStackParamList` type before the `// 🔥 Your screens go here` comment:

```typescript
  JournalEntry: undefined
  JournalHistory: undefined
```

- [ ] **Step 2: Register screens in AppNavigator.tsx**

Add imports at the top:
```typescript
import { JournalEntryScreen } from "@/screens/JournalEntryScreen"
import { JournalHistoryScreen } from "@/screens/JournalHistoryScreen"
```

Add screen registrations after the DebugInspector screen:
```typescript
      <Stack.Screen
        name="JournalEntry"
        component={JournalEntryScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen name="JournalHistory" component={JournalHistoryScreen} />
```

- [ ] **Step 3: Commit**

```bash
git add app/app/navigators/navigationTypes.ts app/app/navigators/AppNavigator.tsx
git commit -m "feat: register journal entry and history screens in navigation"
```

Note: This will have TypeScript errors until the screen files are created in Tasks 4 and 5. That's expected.

---

### Task 4: JournalEntryScreen — Factor Picker Modal

**Files:**
- Create: `app/app/screens/JournalEntryScreen.tsx`

- [ ] **Step 1: Create JournalEntryScreen.tsx**

Full screen implementation with:
- Factor grid (3×4) with predefined factors, each with icon + label + color
- Intensity picker (5 tappable circles, 1–5)
- Optional note text input
- Save button that calls `createJournalEntry()` and navigates back
- Close (X) button

Factor definitions (constant array):

```typescript
const FACTORS = [
  { tag: "caffeine", label: "Caffeine", icon: "cafe-outline", color: "#F59E0B" },
  { tag: "alcohol", label: "Alcohol", icon: "wine-outline", color: "#F87171" },
  { tag: "melatonin", label: "Melatonin", icon: "moon-outline", color: "#A78BFA" },
  { tag: "supplements", label: "Supplements", icon: "fitness-outline", color: "#34D399" },
  { tag: "late_meal", label: "Late Meal", icon: "restaurant-outline", color: "#F59E0B" },
  { tag: "screen_time", label: "Screen Time", icon: "phone-portrait-outline", color: "#60A5FA" },
  { tag: "reading", label: "Reading", icon: "book-outline", color: "#34D399" },
  { tag: "meditation", label: "Meditation", icon: "leaf-outline", color: "#34D399" },
  { tag: "exercise", label: "Exercise", icon: "barbell-outline", color: "#F59E0B" },
  { tag: "stretching", label: "Stretching", icon: "body-outline", color: "#A78BFA" },
  { tag: "stress", label: "High Stress", icon: "alert-circle-outline", color: "#F87171" },
  { tag: "travel", label: "Travel", icon: "airplane-outline", color: "#60A5FA" },
] as const;
```

**Layout structure:**
```
SafeAreaView (background: #06070A)
  Header: "Log Factor" + X button (top right)
  ScrollView:
    Factor Grid: 3 columns, each tile ~100x100
      - Dark glass background (rgba(255,255,255,0.085))
      - Icon (32px) centered + label below
      - Selected: colored border (2px) + slightly brighter bg

    (Visible after factor selected):
    "Intensity" label
    Row of 5 circles (40x40 each):
      - Unselected: rgba(255,255,255,0.1) border
      - Selected: filled with factor color
      - Number label inside each

    Note TextInput:
      - Placeholder "Add a note (optional)"
      - Dark bg, white text, single line

    Save Button:
      - Full width, factor color background
      - "Log {FactorName}" text, white, bold
      - Disabled (opacity 0.4) until factor + intensity selected
```

**Behavior:**
- On save: call `createJournalEntry({ factorTag, intensity, note })`, then `navigation.goBack()`
- Show loading state on save button while API call in progress
- On error: show inline error text, keep form state

- [ ] **Step 2: Commit**

```bash
git add app/app/screens/JournalEntryScreen.tsx
git commit -m "feat: add journal entry modal screen with factor picker"
```

---

### Task 5: JournalHistoryScreen — Entry List

**Files:**
- Create: `app/app/screens/JournalHistoryScreen.tsx`

- [ ] **Step 1: Create JournalHistoryScreen.tsx**

Simple list screen showing today's journal entries.

**Layout:**
```
SafeAreaView (background: #06070A)
  Header: back arrow + "Journal" title
  FlatList:
    Each row:
      - Factor icon (in colored circle) + factor label + intensity dots + note
      - Timestamp (time only, e.g., "2:30 PM")
      - Swipe/long-press to delete (or delete icon button for simplicity)
    Empty state:
      - "No entries today" + "Tap + on the home screen to log a factor"
```

**Data:** Fetch with `fetchJournalEntries(todayDateKey)` on mount.

- [ ] **Step 2: Commit**

```bash
git add app/app/screens/JournalHistoryScreen.tsx
git commit -m "feat: add journal history list screen"
```

---

### Task 6: HomeScreen Integration — "+" Button, Entry Chips, Journal Row

**Files:**
- Modify: `app/app/screens/HomeScreen.tsx`

- [ ] **Step 1: Change "+" button to navigate to JournalEntry modal**

Change line 283 from:
```typescript
<TouchableOpacity style={themed($plusButton)} onPress={() => navigateTo("HomeDetails", "home-details")}>
```
to:
```typescript
<TouchableOpacity style={themed($plusButton)} onPress={() => navigateTo("JournalEntry", "journal-entry")}>
```

- [ ] **Step 2: Add today's journal entries as chips below My Day header**

Add state and fetch logic:
```typescript
const [journalEntries, setJournalEntries] = useState<JournalEntryResponse[]>([])

// Inside useEffect or alongside existing data fetching:
fetchJournalEntries(selectedDate).then(res => setJournalEntries(res.entries)).catch(() => {})
```

Add import:
```typescript
import { fetchJournalEntries, JournalEntryResponse } from "@/services/api/noopClient"
```

Add a `JournalChips` component to render horizontal scrollable chips:
```typescript
function JournalChips({ entries }: { entries: JournalEntryResponse[] }) {
  if (entries.length === 0) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={$chipScroll}>
      {entries.map((entry) => {
        const factor = FACTORS.find(f => f.tag === entry.factorTag)
        return (
          <View key={entry.id} style={[$chip, { borderLeftColor: factor?.color ?? "#60A5FA", borderLeftWidth: 3 }]}>
            <Ionicons name={(factor?.icon ?? "ellipse-outline") as any} size={14} color={factor?.color ?? "#fff"} />
            <Text text={factor?.label ?? entry.factorTag} size="xxs" weight="medium" style={{ color: "#fff" }} />
            <Text text={`${entry.intensity}`} size="xxs" style={{ color: "rgba(255,255,255,0.5)" }} />
          </View>
        )
      })}
    </ScrollView>
  )
}
```

FACTORS constant (same as JournalEntryScreen — or extract to shared file):
```typescript
const FACTORS = [
  { tag: "caffeine", label: "Caffeine", icon: "cafe-outline", color: "#F59E0B" },
  { tag: "alcohol", label: "Alcohol", icon: "wine-outline", color: "#F87171" },
  { tag: "melatonin", label: "Melatonin", icon: "moon-outline", color: "#A78BFA" },
  { tag: "supplements", label: "Supplements", icon: "fitness-outline", color: "#34D399" },
  { tag: "late_meal", label: "Late Meal", icon: "restaurant-outline", color: "#F59E0B" },
  { tag: "screen_time", label: "Screen Time", icon: "phone-portrait-outline", color: "#60A5FA" },
  { tag: "reading", label: "Reading", icon: "book-outline", color: "#34D399" },
  { tag: "meditation", label: "Meditation", icon: "leaf-outline", color: "#34D399" },
  { tag: "exercise", label: "Exercise", icon: "barbell-outline", color: "#F59E0B" },
  { tag: "stretching", label: "Stretching", icon: "body-outline", color: "#A78BFA" },
  { tag: "stress", label: "High Stress", icon: "alert-circle-outline", color: "#F87171" },
  { tag: "travel", label: "Travel", icon: "airplane-outline", color: "#60A5FA" },
] as const;
```

Place `<JournalChips entries={journalEntries} />` between the My Day header and the action list.

- [ ] **Step 3: Add "Journal history" action row**

Add a third `HomeActionRow` in the action list:
```typescript
<HomeActionRow
  title="Journal history"
  icon="journal-outline"
  onPress={() => navigateTo("JournalHistory", "journal-history")}
/>
```

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/HomeScreen.tsx
git commit -m "feat: integrate journal into HomeScreen — chips, + button, history row"
```

---

### Task 7: Extract Shared Factor Definitions

**Files:**
- Create: `app/app/constants/journalFactors.ts`
- Modify: `app/app/screens/JournalEntryScreen.tsx` (import from shared)
- Modify: `app/app/screens/HomeScreen.tsx` (import from shared)

- [ ] **Step 1: Create journalFactors.ts**

```typescript
import type { Ionicons } from "@expo/vector-icons"

export interface FactorDefinition {
  tag: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
}

export const JOURNAL_FACTORS: FactorDefinition[] = [
  { tag: "caffeine", label: "Caffeine", icon: "cafe-outline", color: "#F59E0B" },
  { tag: "alcohol", label: "Alcohol", icon: "wine-outline", color: "#F87171" },
  { tag: "melatonin", label: "Melatonin", icon: "moon-outline", color: "#A78BFA" },
  { tag: "supplements", label: "Supplements", icon: "fitness-outline", color: "#34D399" },
  { tag: "late_meal", label: "Late Meal", icon: "restaurant-outline", color: "#F59E0B" },
  { tag: "screen_time", label: "Screen Time", icon: "phone-portrait-outline", color: "#60A5FA" },
  { tag: "reading", label: "Reading", icon: "book-outline", color: "#34D399" },
  { tag: "meditation", label: "Meditation", icon: "leaf-outline", color: "#34D399" },
  { tag: "exercise", label: "Exercise", icon: "barbell-outline", color: "#F59E0B" },
  { tag: "stretching", label: "Stretching", icon: "body-outline", color: "#A78BFA" },
  { tag: "stress", label: "High Stress", icon: "alert-circle-outline", color: "#F87171" },
  { tag: "travel", label: "Travel", icon: "airplane-outline", color: "#60A5FA" },
]
```

- [ ] **Step 2: Update JournalEntryScreen and HomeScreen to import from shared**

Replace local FACTORS with:
```typescript
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
```

- [ ] **Step 3: Commit**

```bash
git add app/app/constants/journalFactors.ts app/app/screens/JournalEntryScreen.tsx app/app/screens/HomeScreen.tsx
git commit -m "refactor: extract shared journal factor definitions"
```
