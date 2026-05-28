# User journey + feature graph — 2026-05-28

The spine. Every screen in the app must serve at least one moment in the journey below and at least one of the five jobs. If a screen doesn't, it shouldn't exist; if a job doesn't have a screen, that's the gap.

This document is the **source of truth** for "why does this feature exist". Screen designs (from the master plan) are downstream and refer back here.

---

## 1. The bet

A user wears a Whoop 4.0 strap 24/7. They get raw signals (HR, HRV, motion, temp, SpO₂). On their own those numbers mean nothing. The app's job is to **turn signals into decisions** — three or four times a day, the user opens the app to answer a specific question that changes what they do next.

If the app doesn't help with a decision, every other feature is decoration.

---

## 2. The five jobs the user hires the app for

These are mutually exclusive. Every feature must serve at least one.

| # | Job | The question it answers | When the user asks it |
|---|---|---|---|
| **J1** | Am I ready to push today? | "Should I train hard, take it easy, or rest?" | Morning, ~7-9 AM |
| **J2** | Did last night work? | "Was that sleep good? What helped, what hurt?" | Morning, also evening before bed |
| **J3** | Am I overcooking myself? | "Is my body trending into a hole? Am I building chronic stress?" | Throughout the day, especially after big sessions |
| **J4** | When should I go to bed? | "Given today's strain and tomorrow's goal, what's my bedtime tonight?" | Evening, ~6-9 PM |
| **J5** | What's actually changing my numbers? | "Why is my HRV down this week? What if I drop alcohol?" | Weekly, sometimes monthly |

Each job has a primary surface (where it's answered) and 1-2 supporting surfaces (where supporting context lives).

| Job | Primary surface | Supporting |
|---|---|---|
| J1 Am I ready? | Home (Recovery score + verdict) | Health tab (vitals), Strain trend (last 7d) |
| J2 Did last night work? | Sleep detail (this morning's night) | Home (sleep card), Journal (yesterday tags) |
| J3 Am I overcooking? | Strain detail (today + week) | Stress monitor (acute), Health tab (chronic) |
| J4 When to sleep? | Sleep Planner | Home (sleep need card), Strain (today) |
| J5 What's changing? | Insights (cross-day correlations) | Journal (the tags it correlates against) |

---

## 3. A user's actual day

The journey for someone who wears the strap and opens the app 3-5 times a day. Every screen we ship must serve at least one of these moments.

### 3.1 Morning, 7-9 AM — the decision moment

The strap has been gathering all night. The user just woke up, picks up the phone, opens noop.

**They want to know, in ≤10 seconds:**
- Recovery score (today's headline number)
- A verdict in plain English ("Solid recovery — go train")
- The 1-2 reasons it is what it is ("HRV is up 12%, RHR steady")

**Then, if they have another minute:**
- Last night's sleep summary — did I get enough? Quality?
- What does today look like? — strain target, sleep debt going forward

**The decision they make:**
- "Today I'll push hard" / "Today I'll go easy" / "Today is a rest day"

**The features that serve this:**
- Home hero (Recovery score) → primary J1 surface
- Home sleep card (1 line about last night) → glance J2
- Strain target preview ("today's target: 12-14") → forward-looking J3 hint
- A "tap to see why" anywhere on the Recovery card → drilling into the contributors

**What kills this moment:**
- Score with no verdict ("Recovery: 64" — so what?)
- Score with no contributors ("why is it 64?")
- Buried under another screen (user wants it at home, not 2 taps deep)
- A sleep card that just says "7h 51m" without comparison to need

### 3.2 During the day, ad-hoc

The user is at work or going about life. They might open the app:
- After a workout → "did that count as strain? what's my new strain number?"
- Mid-afternoon when they feel tired → "how stressed am I right now?"
- After a stressful meeting → same

**They want to know:**
- Current strain (cumulative for the day)
- Live stress level vs morning baseline
- Whether they're tracking toward today's targets

**The features that serve this:**
- Live HR / strain on home
- Stress monitor (current zone + recent trend) → J3
- Activity log (chip rows on home for today's activities)
- The "what just happened" detection — strap noticed a workout, asks user to confirm

**What kills this:**
- Stress monitor showing 12 empty cells (current state — fabricated data)
- Strain that doesn't update through the day
- No way to add a manual activity if the strap missed one

### 3.3 Evening, 6-9 PM — the planning moment

The user is winding down. Decisions to make:
- Should I do an evening workout, or take recovery seriously?
- When should I go to bed?
- Do I need to journal what happened today?

**They want to know:**
- Today's strain so far → are they in the green zone?
- Sleep need for tonight → based on yesterday + today
- Recommended bedtime (and wake)
- Anything to log?

**The features that serve this:**
- Sleep Planner → primary J4 surface — should be the dominant surface after 6 PM
- Strain detail (today summary) → J3
- Journal CTA on home → J5 setup
- "Wind down at 9:30" nudge (notification or in-app card)

**What kills this:**
- Sleep Planner not showing the planner status strings the backend computes (current bug)
- No bedtime nudge — user has to remember
- Journal hard to find (none exists yet)
- No "smart wake" / alarm window setting (current strap supports it; UI is broken)

### 3.4 Night — passive

The user sleeps. The strap captures everything. The pipeline runs (or, today, doesn't, because triggers were broken — we just fixed that). Nothing should require user attention.

**What it must NOT do at night:**
- Trigger notifications (unless it's the smart-wake alarm)
- Drain battery
- Lose data if the app/phone is asleep

**What it MUST do at night:**
- Detect sleep start
- Buffer raw data locally
- Sync to backend opportunistically when phone is connected
- Be ready with results by morning's J1 moment

### 3.5 Weekly, ~Sunday or Monday — the reflection moment

The user reviews the week. Decisions:
- Was I sleeping enough on average?
- Is my recovery trending up or down?
- Anything I should change next week?

**They want to know:**
- Week summary (HRV / RHR / sleep / strain — 7-day averages with delta vs prior 7 / vs 30)
- The behavioural correlations — "you slept best on days you tagged 'no caffeine after 2pm'"
- Specific patterns the algorithm noticed

**The features that serve this:**
- Health tab vitals grid with 7d/30d deltas (primary J5 surface)
- Insights screen with "what helped / what hurt" — anchored to journal tags (rule 3.9 in the patterns research)
- Coaching paragraphs explaining the trend in plain language

**What kills this:**
- No Insights screen at all (current state)
- Trend graphs without comparison anchors
- Pretty charts but no causal narrative

---

## 4. The decision flow

Five questions the app must always answer when the user lands on Home, in priority order. If any of these isn't answered above the fold, the screen has failed.

```
       ┌────────────────────────────────┐
       │   User opens app               │
       └────────┬───────────────────────┘
                ▼
       ┌────────────────────────────────┐
       │ 1. Is my data current?         │  ← strap connected? data fresh?
       │    (badge: live / Xm ago)      │
       └────────┬───────────────────────┘
                ▼
       ┌────────────────────────────────┐
       │ 2. How am I doing right now?   │  ← Recovery score, big number
       │    (Recovery: 76 — Solid)      │     primary J1 surface
       └────────┬───────────────────────┘
                ▼
       ┌────────────────────────────────┐
       │ 3. What does that mean?        │  ← personalised sentence
       │    (HRV up, RHR steady)        │     contextual J1
       └────────┬───────────────────────┘
                ▼
       ┌────────────────────────────────┐
       │ 4. What should I do today?     │  ← strain target / recommendation
       │    (target 12-14, push okay)   │     forward-looking J3
       └────────┬───────────────────────┘
                ▼
       ┌────────────────────────────────┐
       │ 5. Want to dig deeper?         │  ← drill-ins to Health / Sleep /
       │    (taps into detail screens)  │     Strain / Stress / Insights
       └────────────────────────────────┘
```

---

## 5. The feature dependency graph

Which features unlock which other features. Reading top-down: things at the top must exist before things below them are meaningful.

```
                    [ Strap raw signals (HR, HRV, motion, temp, SpO₂) ]
                                       │
                ┌──────────────────────┼──────────────────────────┐
                ▼                      ▼                          ▼
      [ Sleep detection ]    [ Activity detection ]    [ Continuous HR/HRV ]
                │                      │                          │
                │                      │                          │
                ▼                      ▼                          ▼
      [ Sleep stages ]       [ Activity bouts ]         [ Stress monitor ]
                │                      │                          │
                └──────────┬───────────┘                          │
                           ▼                                       │
                  [ Night features ]                              │
                           │                                       │
                           ▼                                       │
                  [ Baseline profile ]◄──────────────────────────┤
                           │                                       │
                           ▼                                       │
                  [ Recovery score ]◄──── Daily metrics ───────────┘
                           │
                           │
                           ▼
                  [ Sleep need + Sleep Planner ]
                           │
                           ▼
                  [ Journal (tags + checklist) ]
                           │
                           ▼
                  [ Insights (correlations) ]
                           │
                           ▼
                  [ Coaching / AI chat ]
```

**What this graph tells us:**

- **Journal sits above Insights** — you can't correlate behaviour with outcomes if there's no behaviour log. We have to ship Journal first if we want to ship Insights later. Both are net-new — but Journal is the unlock.
- **Stress Monitor depends on continuous HR/HRV** — which exists in raw form (`raw_sensor_records`) but is never aggregated into the per-hour `monitors.stress.todayStrip` field the screen needs. The backend gap is what's blocking the entire stress feature.
- **Baseline profile is a hub** — Recovery, Sleep Need, Stress zones, "vs your normal range" verdicts all depend on it. We have it. It just needs to be exposed in more view models.
- **Coaching / AI chat sits at the end** — it only works when there's a population of metrics + journal entries + insights for the LLM to ground in. Defer until those exist.

---

## 6. Which features add real value vs decoration

Honest categorisation. Tier 1 ships first. Tier 3 only ships if Tier 1 and 2 are great.

### Tier 1 — the app doesn't exist without these
- Recovery score with verdict + reason (J1)
- Sleep detail with HR overnight + stages + comparison (J2)
- Strain detail with Borg-scale gauge + activities + zones (J3)
- Sleep Planner with bedtime/wake recommendation (J4)
- Health tab vitals grid with 7d/30d deltas (J5 spine)
- Stress Monitor with 24h pattern + time-in-zone (J3)
- Day-picker strip (cross-cutting navigation)

### Tier 2 — the differentiators that make us as good as Whoop/Oura
- Journal (tags + yes/no checklist)
- Insights ("what helped / what hurt" anchored to journal)
- Behavioural impact percentages on Sleep detail
- "Calibrating · N days remaining" empty states everywhere
- Smart-wake alarm window
- Personal range bar-fill on every vital
- Hypnogram strip on Sleep detail
- Heart-rate zone breakdown on Strain detail

### Tier 3 — nice to have, not deal-breakers
- AI Coach chat (Whoop Coach analog)
- Push notifications ("Recovery dropped 27%, tap to see why")
- Health Report PDF export
- Apple Health / Google Health Connect integrations
- Sharing a daily snapshot to social
- Custom journal questions
- Cycle insights / women's health (Oura's moat — non-trivial, defer)
- Community / friends / leaderboards

### Tier 4 — cut these
- Trends tab (already dead)
- Inspector as a primary tab (demote to Settings → Advanced)
- Welcome / onboarding screen (already orphaned)
- Anything that says "0%" with no calibration message

---

## 7. Cross-screen flows (the connective tissue)

The screens aren't islands. These flows must work:

**Flow A — "Tap into the why"**
- Home Recovery card → tap → Recovery detail (contributor list with HRV, RHR, RR, sleep)
- Each contributor → tap → that metric's trend detail
- From any trend detail → tap "Add a tag" → Journal entry for that date
- Result: the user can always go from "what" to "why" to "what helped".

**Flow B — "Forward planning"**
- Home → "Plan bedtime →" CTA → Sleep Planner
- Sleep Planner shows: sleep need, recommended bedtime, smart-wake window
- Tap "Arm alarm" → confirmation → notification when wake time comes
- Result: the user closes the loop on tonight's sleep without leaving the app.

**Flow C — "Reflection"**
- Health tab → tap any vital with declining trend → trend detail
- Trend detail "What's driving this?" CTA → Insights filtered to that metric
- Insights → tap a high-impact behaviour → Journal history filtered to that tag
- Journal history → tap a date → that day's full detail (sleep + strain + stress)
- Result: the user can trace a metric drop back to specific behaviour days.

**Flow D — "Quick log"**
- Home floating + button → opens radial menu
  - Add activity (the strap missed one)
  - Log journal (morning checklist / evening tags)
  - Plan bedtime
  - Quick session (breathwork / cold exposure marker)
- Each closes the loop in ≤3 taps.

**Flow E — "Strap-state aware"**
- Top bar of every screen: strap battery + sync status + "Xm ago" stale indicator
- If strap offline or syncing big chunk → screens show "Syncing — your numbers may be incomplete"
- If strap battery low → home banner "Battery 18% — charge soon to keep tracking"
- Result: the user is never confused about whether the numbers are fresh.

---

## 8. The current gaps mapped to jobs

| Job | What's missing | What it blocks |
|---|---|---|
| J1 Am I ready? | Recovery contributor list with 7d AND 30d baselines | Can't answer "is this dip permanent or transient?" |
| J2 Did last night work? | HR-overnight chart, hypnogram, "what helped/hurt" anchored to journal | Can't see *why* a night was good or bad |
| J3 Am I overcooking? | Stress Monitor's `todayStrip` + `timeInZone` (backend fabricates these), Strain Z1-Z5 breakdown | Can't see acute load patterns |
| J4 When to sleep? | Sleep Planner ignores `smartWakeStatusText` / `sleepReserveText` / `estimatedSleepHours` (already computed, never rendered) | User can't trust the bedtime recommendation |
| J5 What's changing? | Journal screen (does not exist), Insights screen (does not exist), per-vital trend drill-downs | Entire reflection workflow has no surface |

The two **net-new** surfaces (Journal + Insights) are the highest-leverage Tier 2 work — they unlock J5 entirely.

---

## 9. The picking order, derived from this

Given the master plan order was implementation-engineering oriented (clear dependencies first), the **user-value oriented** order is:

| # | Build | Why |
|---|---|---|
| 1 | **Home Recovery card with contributors + dual baseline** | Most-opened surface, primary J1, currently weak |
| 2 | **Sleep detail with HR overnight + hypnogram + factor translation** | Second-most-opened, primary J2 |
| 3 | **Sleep Planner** rendering the planner-status backend strings | Closes J4 loop with existing backend |
| 4 | **Strain detail** with Borg gauge + activity rows + Z1-Z5 | Primary J3 (acute) |
| 5 | **Stress Monitor backend contract** + 24h pattern + time-in-zone | Primary J3 (continuous) — depends on backend gap |
| 6 | **Health tab rebuild** with vitals grid + dual baseline | Primary J5 spine |
| 7 | **Journal** (Whoop checklist + Oura tags hybrid) | Unlock for J5 reflection |
| 8 | **Insights** ("what helped/hurt") | Top of J5 funnel |
| 9 | **Day picker + floating +** cross-cutting | Polish; needed before Insights but flexible |
| 10 | **Empty/calibrating states** everywhere | Polish; required before public launch |

This order doesn't perfectly match the master plan §7 (which was engineering-priority). The diff:
- Master plan led with Backend monitors contract first. The user-journey order leads with Home Recovery contributors first because that's J1's primary surface.
- We could merge: ship the backend monitors contract alongside the Home Recovery rebuild (they're touched in the same view model).

---

## 10. Open product decisions to make next

Before any single screen is designed:

1. **Are we building toward "as good as Whoop" or are we picking a unique angle?**
   - If "as good as Whoop": follow the patterns. Predictable, defensible.
   - If a unique angle: what is it? Specific opinion: noop's TRUE differentiator could be the **causal narrative** ("here's why your number changed, citing your data") — every other app gives you charts; we'd give you sentences. The Journal + Insights pair is what enables that.

2. **Is the AI Coach a v1 feature or v2?**
   - v1: need to integrate an LLM, provide content, decide on subscription gating
   - v2: ship affordances ("Ask about this") that route to "coming soon"

3. **Pricing model — free, subscription, hardware-locked?**
   - Changes what features can be free vs paywalled
   - Changes how aggressive we can be with PDF reports, integrations, etc.

4. **What's the minimum journal viable for shipping Insights?**
   - Minimum ~30 days of journal entries before any correlation is meaningful
   - Implies: ship Journal early, hide Insights until ~30 days of data exist for the user

5. **Notifications strategy — push or in-app only?**
   - Whoop/Oura push for big drops in Recovery; for noop's first version, in-app banners may be enough

---

## 11. What this document is for

Two purposes:

- **Anchor for screen design.** When we sit down to design a screen, we open this doc, find which job it serves, and design backwards from the question the user is asking in that moment. No screen exists "because Whoop has it" — only "because it answers job J_n at moment M".

- **A way to say no.** Anything that doesn't serve a job in §2 or a moment in §3 is decoration. We say no.

When we pick the first screen to design (recommended: Home Recovery contributors, per §9), we come back to this doc and define:
- Which moment(s) in §3 it serves
- Which job(s) in §2 it answers
- Which flow(s) in §7 it sits inside
- Which features (Tier 1-4) it depends on

Then we write the screen-level spec. Without this anchor, every screen is just a guess.

---

End.
