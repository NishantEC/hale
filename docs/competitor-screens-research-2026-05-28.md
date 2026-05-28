# Competitor screens research — secondary surfaces (2026-05-28)

Research conducted via Mobbin MCP to inform the redesign of noop's secondary screens (Trends, Health, Stress, Strain, Sleep Detail, Recovery, Journal, Insights, Settings). The home screen is good; everything else needs to reach the bar set by the apps below. Each app section catalogues real screens observed on Mobbin (iOS), the patterns that make them work, the metrics they expose, and any novel UX moments.

App-by-app sections are followed by a synthesised "patterns" section at the end identifying the design vocabulary that's recurring across the category.

---

## 1. WHOOP — the gold standard

WHOOP is the closest analogue to noop and the strongest reference for almost every secondary screen. It has, by some margin, the most thoughtful information density and the deepest "tap-to-explain" structure of any app researched here.

### 1.1 Home / Overview (today)

WHOOP's home is a single dark scroll with a hero ring (Recovery + Strain + Sleep stacked into one concentric meter) and a long stack of "key statistic" cards underneath.

What makes it work:
- The hero is a **tri-ring**: outer Recovery (yellow/green/red), inner Strain (blue), and a tiny Sleep % in the centre. One glance gives the three headline scores plus colour-coded valence.
- Below the ring: a "Welcome / Personalised Baseline" card that doubles as onboarding state — it disappears once the user is calibrated.
- A persistent **"Ask WHOOP anything"** prompt sits as a chat-style row, plus a **Sleep Planner** card showing "Plan bedtime →" with predicted bedtime/wake.
- A **CUSTOMIZE** pill at the right of "Key statistics" — they let the user reorder/hide the stack of HRV / Sleep Performance / Calories / Hours of sleep rows.
- Each key stat is rendered as: icon + label on the left, big number on the right with the **previous-30-day baseline below it** as a smaller grey number plus a up/down arrow.
- A floating "+" action button bottom-right opens "Create WHOOP Live / Journal / Strength Trainer / Add Activity / Start Activity" in a radial pop-up.

Information at a glance: today's three headline scores + colour valence + onboarding nudge.
Information after a tap: each statistic row drills into its own day/week/30-day/6-month chart screen.

### 1.2 Day picker bar

The day picker `< TODAY >` sits at the very top with the battery indicator on the right and the user avatar on the left. Tapping the date opens a calendar; chevrons step day-by-day. **The picker is global** — it persists across Overview / Sleep / Recovery / Strain tabs so the user's "current day" is always shared.

### 1.3 Recovery detail tab

`OVERVIEW · SLEEP · RECOVERY · STRAIN` sub-tabs are pinned just below the day picker.

The Recovery tab is a long scroll consisting of:
1. **Hero ring** — big "RECOVERY 57%" inside a yellow ring; share icon; tap-info "i" in the corner.
2. **Verbal headline** — "Solid Recovery" with a 1-2 sentence personalised story below: "Your HRV (39 ms) and RHR (56 bpm) are within their usual ranges which resulted in a solid recovery. Stay on track with your fitness goals by building moderate Strain today."
3. **Chat row** — "Chat to learn about Recovery" (opens WHOOP Coach with pre-seeded prompt).
4. **RECOVERY STATISTICS — VS. PREVIOUS 30 DAYS** section header.
5. List of contributors: HRV / RHR / Respiratory Rate / Sleep Performance. Each shows: icon + label on the left, today's value as big number on the right, and beneath that the 30-day baseline (smaller grey) plus a green up-arrow or red down-arrow tick.
6. **"What is Recovery?"** explainer card (purple-bordered, slightly larger than the rows) with a small visual of the ring — purely educational.
7. **RECOVERY STATISTICS — VS. LAST 7 DAYS** section with the same structure but on a 7-day baseline. The two-baseline comparison is one of WHOOP's strongest moves: it lets you see drift over 30 days and acute change over 7 days simultaneously.
8. Drill-down: tapping any row (e.g. HRV) opens a **dedicated trend card** — a line chart with point labels (38, 30, 32, 40, 39…), x-axis days Tue-Mon, current day highlighted with a grey column. Below it the next contributor (e.g. Resting Heart Rate) is a similar card.

Patterns that make it work:
- "VS. PREVIOUS 30 DAYS" and "VS. LAST 7 DAYS" are the actual section headers in the all-caps small grey label — not a tooltip — establishing the reference frame immediately.
- Tap-target row shows current vs baseline, then tap drills to a 7-day line chart with the current day as a highlighted grey column on the right.
- Every contributor uses the same "icon · label · big value · smaller baseline + delta arrow" row, so the eye trains fast.

### 1.4 Strain detail tab

Strain works in mirror-image to Recovery:
1. **Hero ring** — big "STRAIN 12.8" inside a blue ring.
2. **Verbal headline** — "Balanced Strain" + paragraph: "Today your activity level perfectly matched what your body was capable of achieving. Continuing to stay under 13.3 will set you up for more productive workouts tomorrow."
3. **Strain explainer modal** that pops over the overview, showing a curve from Resting → Light → Moderate → Strenuous → All Out (with the current point as a dot, "HALF MARATHON" label) — uses the **0-21 Borg scale** WHOOP invented.
4. **STRAIN ACTIVITIES** — pill-style row showing the workout that contributed: "11.8  FUNCTIONAL FITNESS  5:25 PM → 4:22 PM".
5. Same dual-baseline statistics blocks: **AVERAGE HR 67 (vs 68 ▼)**, **CALORIES 2,260 (vs 1,947 ▲)**.
6. Below: "What is Strain?" educational card with the purple/orange gradient border.
7. **Trend cards** at the bottom: a big bar chart "STRAIN" (Tue 4.3, Wed 13.4, Thu 13.5, Fri 5.1, Sat 4.9, Sun 12.8 etc) — point-labelled. Then an "AVERAGE HR" line chart with point labels.

Notable: the **point labels on every chart** (so the user doesn't have to scrub) and the **highlighted grey "today" column** that anchors orientation.

### 1.5 Sleep tab

Per-day Sleep tab:
1. Big "SLEEP PERFORMANCE 66%" headline with two big numbers below: **5:51 HOURS OF SLEEP** and **8:52 SLEEP NEEDED**, each in its own outlined pill.
2. Coaching paragraph "Try to get more sleep…".
3. Sleep activity row — pill: moon icon + duration + sleep window (10:12 PM - 4:47 AM).
4. **SLEEP STATISTICS vs. PREVIOUS 30 DAYS** — Time in Bed 6:33 (7:31 baseline), Consistency 67% (70% ▼), Restorative Sleep % 28% (37% ▼), Sleep Debt 1:30 (1:10 ▲ — red because more debt is worse).
5. "What is Sleep Performance?" purple-bordered educational card.
6. Below: trend cards — **HOURS VS NEED** (two-line overlay — green "hours of sleep needed" line plus a grey "hours of sleep actual" line with labelled points), **TIME IN BED** bars, **SLEEP PERFORMANCE** bars.

### 1.6 Sleep detail (full-screen view)

When you tap the sleep session pill, a full-screen "SLEEP" view opens:
- Top: "6:33 HOURS OF SLEEP ▲6:35" + "2:56 RESTORATIVE SLEEP ▲2:45" — two numbers with the prior-night value as a smaller delta.
- A **2-line teaching card** "REM and deep sleep accounted for 41% of your total time in bed. This is an optimal amount for healthy, restorative sleep. Learn more with WHOOP Coach".
- **Heart rate during sleep graph** — a dense thin line from 10:24 PM → 5:30 AM, y-axis 30/60/78/90 bpm, with the sleep window endpoints labelled.
- **Sleep stage stacked bars (one per stage)** — Awake 7% 0:32, Light 52% 3:37, SWS (Deep) 25% 1:47, REM 16% 1:09. Each row has a coloured filled bar plus a striped/hatched "typical range" area overlaid, so users instantly see whether they were inside or outside their personal norm.
- The hatched "typical range" overlay is one of WHOOP's standout visual moments — it's a single chart that simultaneously shows actual vs personal baseline without needing two axes.

### 1.7 Stress Monitor (real-time)

Full-screen dedicated experience reachable from the overview card:
- Top: a **half-arc gauge** from 0 to 3.0 with the needle pointing to the current value (e.g. "0.8 LOW"). The arc colours blue → green → orange → red across the range.
- Sub-label: "Last updated 12:35 PM".
- Below: a **24-hour line chart** of the stress score, y-axis 0-3, with sleep periods marked with a moon icon and workouts marked with a barbell icon at the top of the chart. The chart uses **green/yellow/orange/red colouring per-segment** based on the score band.
- A magnifying-glass icon bottom-right of the chart for zoom.
- A coaching message: "Most of your time was spent in the low stress zone. Your longest period of high stress started at 4:59 PM and lasted for 24 minutes."
- A **TOTAL DAY** segmented bar — vs prior 7 days — showing time spent in each stress band (low/medium/high) as a stacked horizontal bar.
- Below that: a **"SESSIONS WITH DR. ANDREW HUBERMAN"** carousel — guided-breathing programmes ("Increase Relaxation", "Increase Alertness") — and a collapsible **HOW IT WORKS** explainer.

The "i" info icon in the top right opens an in-context modal explaining the score; the gear icon opens settings for the monitor.

### 1.8 Activity / workout detail

A live-workout screen and a saved-workout detail screen. The live screen is striking:
- Red top bar with `🏁 00:28:53` timer and Discard / End & Save buttons.
- Hero: a **strain ring** with "ACTIVITY STRAIN 11.8 OPTIMAL" + a small dial cursor on the arc showing where the current value falls vs the optimal zone (the dashed grey arc beyond the cursor is "above optimal").
- **HEART RATE 133** with a horizontal zone bar (50-59% / 60-69% / 70-79% / 80-89% / 90-100%) and a white dot showing the current zone — currently 70-79%.
- Bottom row: **AVG HR 147 / MAX HR 167 / CALORIES 341**.
- Swipe right reveals "Heart Rate" detail page (live line chart with current BPM as a big black ringed bubble + zone label); swipe left reveals "Map" (for outdoor activities).

Saving lifecycle: pulse rings on a "Calibrating…" → "Saving…" overlay before the activity card appears in history.

### 1.9 WHOOP Coach (chat)

Modal chat opens with the BETA tag.
- System prompts at the top: "What are you curious about today, [name]?".
- The assistant responds in markdown with bullet points and inline numbers ("Your average Recovery of 53% is less than the average of 61%…").
- Below the response is a **carousel of "ARTICLE" cards** ("Ask Us Anything: WHOOP Strain", "How Does WHOOP Strain Work?") for further learning.
- A **horizontal chip strip of suggested follow-ups** ("How can I improve my Recovery score?", "What activities con…") — these are precomputed nudges based on the conversation state.
- The send field is a pill at the bottom with an attachment "+" on the left and a small arrow send button.

### 1.10 Journal

The Journal is two distinct modes — **filling it out** and **getting insights**.

Daily entry screen ("JOURNAL — What happened yesterday?"):
- Sections grouped (`LIFESTYLE`, `SLEEP`, `STATUS`) with a small all-caps label.
- Each question is a row with the question on the left and two square buttons on the right (× and ✓) so the user taps yes or no. A green ✓ is filled when selected.
- When a question is answered ✓, a **revealed follow-up appears inline** (e.g. "Have any caffeine? ✓" then below it "How many servings? [-] 1 [+]" and a slider "When was your last serving? 10:30 AM").
- "Have an injury or wound" / "Feeling sick or ill?" use a green/grey **toggle** instead of × / ✓.
- A free-text "Add a note…" field at the bottom.
- Sticky "SAVE JOURNAL" button outlined in green.

Custom journal screen ("CUSTOMIZE JOURNAL"):
- Horizontal tab strip: `ALL · CIRCADIAN HEALTH · HEALTH STATUS · LIFESTYLE`.
- Long scrollable list of every behaviour the user can toggle on (Acupuncture, Added Sugar, AD(H)D Medication, AG1 supplement, Air Travel, Alcohol, Anti-Anxiety Medication, Anti-Inflammatory Drugs…). Each row has a `(+)` to add; a green checkmark when added.
- "Choose 5 items to track, ideally ones that you don't do every day" coaching copy on the first time setup screen.

Insights screen (the "what hurts vs helps" view):
- Header: "Recovery Impact Analysis — Record at least 5 yes's and no's in your journal to see how behaviours impact your Recovery."
- Below: a chart titled "HURTS  % IMPACT  HELPS" with three horizontal rows, each a behaviour. Each row shows a dot positioned along a 0% axis, with a coloured bar extending to its impact value (e.g. +21% green, -6% orange, -13% red). The orange/green-tipped triangles in the header act as filter toggles between Hurts and Helps.
- A "Customize your journal behaviors — Pick from a list of 100+ behaviors to track their impact on your Recovery" call-out card.

This is **probably the most defensible feature in the WHOOP app**: not "your sleep was bad", but "drinking alcohol drops your Recovery by 13% on average".

### 1.11 Plan tab (My Week / Insights / Overview)

The Plan tab uses 3 sub-tabs:
- **MY WEEK** — "Plan your week ahead". A horizontal step indicator (1-2-3-4-5-6-7 days, current day highlighted) labelled "RECOVERIES LOGGED 0/7", then a **SLEEP BEHAVIOR CHALLENGES** card stack ("Sleep Deeper", "Sleep Consistently", "Sleep Longer") each with a short rationale and selectable. Below: "Maintain / Recover / Prioritize Sleep / Vacation" plans card list with subtle coloured gradients per plan name. Then a "Create a Custom Plan" CTA at the bottom.
- **INSIGHTS** — the Recovery Impact Analysis view described above.
- **OVERVIEW** — meta tab showing **SLEEP PLANNER** (Suggested Bedtime 10:16 PM / Time in Bed (to peak) 9:14 / Wake Time 7:30 AM), **HEALTH MONITOR** (5-icon strip RESP / SpO2 / RHR / HRV / TEMP — each currently "Data not found" or with a value), **PERFORMANCE ASSESSMENTS** (Monthly / Weekly buttons that open the formal weekly/monthly reports), plus a **STRAIN TARGET** ring "You need 4 days of data to generate a Strain Target" empty state, and a **Strength Trainer** call-out card.

### 1.12 Sleep Planner

A dedicated bedtime-planner with three modes:
- "Try getting to bed by 10:16 PM to achieve 100% Sleep Need by 7:30 AM" header.
- "TOMORROW I WANT TO  [PEAK]" — pill button toggles goal (PEAK / PERFORM / GET BY = 100% / 85% / 70% Sleep Need).
- Two big columns: **10:16 PM SUGGESTED TIME TO BED** and **7:30 AM YOUR WAKE TIME**, with a horizontal "TIME IN BED  9:14" bar between them with hatched edges showing margin.
- A copy strip "OPTIMAL — Three nights of sleep are needed to calculate optimal bed and wake times" (empty-state copy that explains the dependency).
- An ALARM toggle row below with "ALARM SET TO  OFF / WAKE TIME SET TO  7:30 AM" two pills.

Alarm mode selection sheet pops up from the bottom (`EXACT TIME / SLEEP GOAL / IN THE GREEN / DON'T USE AN ALARM`) — "IN THE GREEN" wakes the user only once Recovery turns green.

The **schedule** screen shows the days you've scheduled (M T W T F highlighted, S S grey) with the 5:45 AM exact-time row above and a "You have unscheduled days" yellow warning text.

### 1.13 Weekly / Monthly Performance Assessment

Locked behind a calendar icon in Plan → Overview — "MONTHLY" and "WEEKLY" two square buttons that open a multi-page assessment report. (Mobbin's WHOOP coverage hints at this but the full report flow isn't fully indexed; references confirm the structure: weekly summary card with sleep/strain/recovery averages, a paragraph editorial, and a "behaviours that helped / hurt" recap.)

### 1.14 Calendar / Trends

The day picker's calendar pops over the screen — month grid with each day showing a tiny coloured dot indicating that day's Recovery colour (green/yellow/red). Tap a day to jump to it.

### 1.15 Strain Coach

A "Search activities" screen organised by Strain / Recovery / Sleep tabs that lists activities and their effect on each metric.
- `RUNNING [▼]` collapsible header.
- WHOOP GUIDED BREATHING section: "Increase Alertness", "Increase Relaxation".
- OTHER ACTIVITIES list: Air Compression, Air Compression (Normatec), Breathwork, Ice Bath, Massage Therapy, Meditation…
- Each row is an icon + name; tap navigates to "how to do this" or "what it impacts" detail.

A daily strain goal screen during goal-setting: `15.2` strain target inside a partial-arc ring with two activity pills along the arc (`8:00 AM walking icon` and `12:00 PM running icon`) marking moments of the day where strain accumulated.

### 1.16 Activity selector

`SELECT ACTIVITY` opens a search-then-list:
- Search bar at top.
- ALL · STRAIN · RECOVERY · SLEEP segmented filters under the search.
- "MOST RECENT" subsection (Functional Fitness, Running) above an all-alphabetised A-Z list.
- Each row: small icon + activity name.
- A separate `SELECT EXERCISES` screen for the strength trainer with thumbnails per exercise.

### 1.17 Health Monitor (vitals)

Reached by tapping the 5-icon strip. The full-screen view:
- Top "HEALTH MONITOR" header.
- A small `OFF-BODY ❤` indicator at the top showing the strap isn't currently on the wrist.
- "LAST NIGHT'S READINGS" section header (small all-caps grey).
- A 2-column grid of stat tiles: RESPIRATORY RATE 12.2 rpm / BLOOD OXYGEN 94% / RHR 58 bpm / HRV 34 ms / SKIN TEMP (FROM BASELINE) — / each with a sub-label "Calibrating range" (or the actual normal range when calibrated).
- A "SHARE YOUR HEALTH REPORT — Printable report for sharing with your doctor, physician, trainer, or anyone of your choosing" CTA card at the bottom with an arrow.

### 1.18 Settings

`APP SETTINGS` is a dark list of rows with icon + label:
- NOTIFICATIONS
- ACTIVITY SETTINGS
- WHOOP COACH
- JOURNAL
- INTEGRATIONS
- DATA EXPORT
- GOALS
- PREGNANCY INSIGHTS (sex-aware feature)
- HIDE METRICS (privacy-style; lets users opt out of seeing specific metrics)

Each row pushes a sub-page.

### 1.19 Novel WHOOP moments

- The **dual-baseline reference frame** ("vs prev 30 days" + "vs last 7 days") on the same screen.
- The **hatched typical-range overlay** on the sleep stage bars.
- The **0-21 Borg-style strain scale** rendered as a curve with named bands (Resting / Light / Moderate / Strenuous / All Out).
- The **AR face-cam strain overlay** (the AR camera screen shows the user's face with Activity Strain / Calories / Timer / BPM HUD floating on top of a live camera feed — for sharing).
- The **"IN THE GREEN" alarm mode** that delays the alarm until Recovery turns green.
- The **chat-as-explainer pattern** ("Chat to learn about Recovery" links into a coach conversation seeded with that metric).
- **Point-labelled bar/line charts** — every number is rendered above its point, removing the need to scrub.
- **Highlighted grey "today" column** on every 7-day chart.

---

## 2. Oura — readiness/sleep done with elegance

Oura's secondary screens are notable for clarity, restraint, and a strong "card with a number + contributors" pattern. They use big half-arc gauges and consistent contributor bars on every score detail.

### 2.1 Home (Today)

A vertical scroll of large image-backed score cards:
- **READINESS 90 OPTIMAL** with a half-arc gauge and a "Rise and shine" headline plus a personalised sentence below.
- **SLEEP 91 OPTIMAL** with a half-arc gauge, a thin sleep-session bar (10:58 PM ----- 8:49 AM), 9h 31m duration, and 46 bpm resting HR icons.
- **DAYTIME STRESS** — a hatched purple "stressed / engaged / relaxed / restored" line chart split into morning/evening segments.
- **CYCLE INSIGHTS** card — small bar chart of body temperature deviation per cycle day, with the current day labelled "Cycle day 30 −0.3°C".
- **BODY CLOCK** — a horizontal sinusoid showing aligned vs misaligned sleep midpoint and a coaching line "The midpoint of your sleep was aligned with your chronotype".
- A "Trends shown below are based on your focus area" header chip — Oura asks the user to pick a focus (`Be productive and energetic`) and reorders the cards accordingly.
- Bottom tab bar: Home · Readiness · Sleep · Activity · Explore.

A floating "+" bottom-right opens: `Unguided session / Add a tag / Add a workout / Record workout HR / ✕`.

A pinned bottom indicator "Rest Mode is on" lets the user enter recovery mode where goals are paused.

### 2.2 Readiness detail

Tap the Readiness card or the Readiness tab:
- Half-arc gauge "90 Optimal" with a crown icon (their visual for "optimal").
- "Rise and shine" headline + personalised paragraph.
- "Your Readiness Score for the past 7 days" header.
- **7-day line chart** with the current day as a filled dot, the previous days as smaller dots, a dashed reference line at 79 (last-week mark) and at 50 (poor threshold). X-axis FRI SAT SUN MON TUE WED THU.
- **Day-strip scrubber** at the top — small bars showing Readiness score per day across the week (current day larger, others smaller). Tapping a bar swaps the whole detail screen to that day.
- **READINESS CONTRIBUTORS** section: a stack of rows each with the label on the left, a coloured horizontal bar (blue if good, red if pay attention), and a verdict on the right (Optimal / Good / Fair / Pay attention). Contributors include Resting heart rate, HRV balance, Body temperature, Recovery index, Sleep, Sleep balance, Sleep regularity, Previous day activity, Activity balance.
- **Vitals quick-stats grid**: 4 tiles — Resting heart rate 46 bpm, Heart rate variability 74 ms, Body temperature −0.3 °C, Respiratory rate 12.6 / min — each with a chevron `>` to drill in.
- A "READINESS SCORE 90 OPTIMAL" card pinned beneath the grid summarising the day's score.

### 2.3 Sleep detail

Sleep tab:
- Hero half-arc "91 Optimal" with a crown.
- Headline "A good night's sheep" (their cheeky empty-state copy when they detect a typo joke) — usually it's "A good night's sleep".
- "You slept 9h 31m last night." paragraph.
- **Hypnogram** — a 4-row stacked bar chart (Awake / REM / Light / Deep) across 11:12 PM → 9:31 AM with sleep stages as coloured rectangles per minute. The current stage palette: Awake = white, REM = light blue stripe, Light = mid blue, Deep = dark blue.
- A legend with the duration per stage: Awake 0h 48m / REM 2h 4m 22% / Light 6h 5m 64% / Deep 1h 22m 14%.
- **SLEEP CONTRIBUTORS** rows (same shape as readiness): Total sleep, Efficiency, Restfulness, REM sleep, Deep sleep, Latency, Timing — each with a coloured bar + verdict on the right.
- A "Details" sub-section that expands into time-asleep, movement marks, etc.

When you tap "Time asleep" you get a sub-detail with a stretched hypnogram (12:37 am → 7:36 am window endpoints labelled in pill bubbles), a **Movement** strip below the chart (small vertical ticks per movement event), and the stage durations restated.

### 2.4 Activity detail

- Half-arc gauge "Activity 3 Active calorie burn / goal 650" with an "Edit activity goal" button.
- 2x2 stat tile grid: Activity Score 50 / Inactive time 0h 53m / Total burn 1,858 Cal / Steps 62 — each tappable.
- **Daily movement strip** — a 24-hour horizontal bar with bands High/Medium/Low/Inactive, coloured per minute of the day, showing what level the user was at over time.

### 2.5 Trends

A dedicated `Trends` screen accessible from the home menu. The first card is highlighted as "Trends shown below are based on your focus area" with a (i) link.

- Each trend is a **square mini-card** showing: metric name, "Last 7 days" sub-label, a tiny line chart, and the average value below it. Examples:
  - Inactive time — bar chart, "0h 33m avg this week"
  - Heart rate variability — sparkline, "74 ms"
  - Sleep efficiency — sparkline, "92%"
- Below: a list of category rows that drill in: Sleep > / Readiness > / Activity > / Stress >. Each opens a full-screen multi-metric trend page.
- The full-detail page (e.g. "1 Oct - 7 Oct (Week 40)") is a vertical scroll of multiple charts each with a verbal paragraph below it: "A downward resting heart rate trend implies that you've recovered well, an upward trend that something may be challenging your recovery."
- Sleep Stages trend has D · W · M · Y tabs at top — Day shows a single tall thin column with "8h 45m" label and a typical-range hatched zone behind it; Month shows a stacked-area chart of all sleep stages across the month; Year shows a long stacked area across all months.
- **Below the chart: "Tags and activities" pill row** — every tag the user has logged shows as a pill ("+Add a tag · Blood donation · Cardiovascular exercise · Dark bedroom") — tapping highlights the chart days that were tagged with that tag. This is the **tap-to-anchor + tap-tag-to-filter** combo that's hard to find elsewhere.

### 2.6 Tags / Journal

Oura's journaling is purely "tag-based" — no yes/no questions like WHOOP. The flow:
- Pop-up "What's going on?" with help text "Tag the things that are straining you right now to keep an eye on your recovery and trends. You can update the tags whenever needed."
- A **search field** with a list of "Suggested tags" as wrapping pills: Airplane, Alcohol, Allergies, Anxiety, Baby care, Back pain, CPAP, Common cold, Confirmed COVID-19, Cramps, Diarrhea, Fatigue, Fever, Flu, Hangover, Headache, Injured, Medication, Migraine, Nasal congestion, Nausea, Pain, Pregnancy, Sad, Sick, Sore throat, Stress, Surgery, Tired, Travel, Vacation…
- Then an "All tags" alphabetised list below for full search.
- A "Tag entry added" green confirmation toast also includes a **member-aggregate insight**: "Oura Members who tag Blood donation see an average 7% decrease in heart rate variability."
- "New tag entry" search lets the user add multiple tags at once (pills accumulate above the search field).
- A "How do you feel?" sheet with 5 options (Much better / Better / Same / Worse / Much worse than usual) appears separately.

### 2.7 Cycle Insights

- Heading `Cycle Insights` with `Temperature · History` tabs.
- Current cycle card "Current, started 1 Nov · Day 30".
- The History tab lists past cycles as rows (`1-31 Oct · 31 days`).
- The Temperature tab shows the temperature-deviation bar chart with cycle day on x.
- Onboarding modal: "Body temperature and cycle tracking — Hormonal changes during the menstrual cycle cause natural variation in your body temperature…".

### 2.8 Stress / Heart rate

`Heart rate and stress` screen — a 24-hour HR line chart at top with a small data-point pin at 9:31 AM. Below it is a list of **collapsible accordion sections**:
- Restorative Time (with chart inside)
- Stress (with chart inside)
- Sleeping  46-62 bpm Range (taps open a chart of sleep HR over the night)
- Workouts — empty state "Your detailed workout HR range will appear here when you record a workout while wearing your ring."
- Daytime  64 bpm Lowest avg — a line chart of average daytime HR with a 9:31 AM pin.

Each accordion has an icon palette (orange, blue, pink, green) — they colour-code the section visually.

### 2.9 Daytime stress

`Daytime stress` screen — a hatched purple area chart with a y-axis labelled `Stressed / Engaged / Relaxed / Restored` (four bands). Below: a Daily movement bar chart (Low/Medium/High legend), a tile pair `Stressed 0m / Restored 0m`, and a coaching card "Relaxed — 10:30 AM — Your body is in a relaxed state, enabling it to build up valuable energy reserves for whatever you have coming up."

### 2.10 Body Clock / Chronotype

`Body Clock` — a circular **24-hour clock face** with the sleep midpoint as a dot orbiting it, the optimal sleep window as a coloured arc, and a coaching card below: "Sleep alignment — Aligned — The midpoint of your sleep was aligned with your chronotype. Early evening type — You are more of an evening type but not to the extreme."

A separate `Chronotype` screen explains the user's type ("Evening types tend to be innovative — Optimal sleep schedule for you") with the same 24-hour ring, plus "Asleep 11:57 PM / Midpoint 3:57 AM / Awake 7:57 AM" as three columns at the bottom.

### 2.11 Members

A "Members" view (their social feature) with two stylised eyes at the top, then a quick-glance row "Readiness 90 / Sleep 91 / Activity 50" with the family members' scores as small charts; an "Invite member" CTA at the bottom.

### 2.12 Novel Oura moments

- **Half-arc gauges with a "crown" icon** as a status badge inside the arc (a small detail but instantly readable).
- **Contributor bars that are both quantitative and verbal** — the bar fills in a colour proportional to the contribution and a one-word verdict on the right (Optimal / Good / Fair / Pay attention).
- **Tag-to-filter on trend charts** — every logged tag becomes a chart filter pill.
- **Member-aggregate context** ("Oura Members who tag X see Y%") — community-level priors when you start tagging.
- **Focus areas** — the user picks a goal ("Be productive and energetic") and Oura reorders the cards and tunes the headline copy.
- **Cheeky empty-state copy** ("A good night's sheep") that turns a typo into a nudge.
- **"Rest Mode"** — a switch to suspend goals so the score doesn't punish recovery.
- **The Body Clock circle** — a non-bar/line representation of circadian alignment.

---

## 3. Ultrahuman — score-rich, dense, contributor-led

Ultrahuman's app is the most data-dense per screen and its visual language leans more into score + many contributors + community comparison.

### 3.1 Home (Ring tab)

Top-level home is a dark scroll with sub-sections:
- **Header strip** `SAT 19 JUL · SUN 20 JUL · TO[DAY]` swipeable date picker.
- **SLEEP 84  Optimal REM detected** card — score in green, a coaching paragraph ("REM is characterised by relaxed muscles, quick eye movement, irregular breathing, elevated heart rate, and increased brain activity. Getting enough REM is key to overall health and performance.") and inline mini-meta: 🕐 1:03 AM / ☀ 7:53 AM, "6h 10m SLEEP DURATION / 4 full SLEEP CYCLES" two columns with green checks. A horizontal sleep-cycle dot strip.
- **DYNAMIC RECOVERY 87** card with a green pill "due to stress rhythm", a green progress bar "4/6 metrics within range", and three coloured chips at the bottom: RHR ✓ / Temp ✓ / HRV ✓.
- **STRESS RHYTHM** card "78" with the bar.
- **HRV ring** at the very top (`86 ms HRV` rendered as a circle of pink dots forming a halo).
- A **"Here's to a more active you"** card mid-scroll with a brief paragraph and a sparkline of activity throughout the day, plus a "Switch from Other Rings — Get up to $100 in trade-in credit" promo.
- A "Connect Ring" pinned row at the bottom (device state).

The bottom tab bar: RING · METABOLISM · ZONES · DISCOVER · PROFILE (sometimes HOME).

A secondary home variant (cleaner) shows:
- **Individual Markers** big-text section header.
- Cards: 🤍 Heart Rate 67 BPM with a sparkline, Cardio Age 23 with a "Younger than your age" green pill, Temp deviation −0.47°C with a thermometer bar, HRV 7-day baseline 45 ms +8, Resting HR Sleep Time Minima 44 BPM −12, VO₂ Max Cardio Fitness 51.

### 3.2 Dynamic Recovery detail

A full-screen scroll triggered by tapping the Recovery card:
- Top: small bar-chart strip (Tue 39, Sun 87 highlighted in white, prior days shorter in grey) — the **week strip with prior-period comparison**.
- "87 Dynamic Recovery Score" left-aligned in light grey big text.
- "Record what affected your recovery — [+ Add a tag]" button.
- **Contributors** card stack:
  - Resting Heart Rate 44 BPM — Reduced & Within Range (green pill) — sub-numbers 46 BPM / 41 BPM (the user's range).
  - Skin Temperature −0.47°C — Below Range & Optimal (green pill).
  - 7-day HRV Form 45 ms — Increased & Within Range (green pill) — sub-range 77 ms / 37 ms.
  - Last night's HRV 54 ms — Within Range.
  - Sleep Index 84 — Good (orange pill).
- Each row has a chevron `>` and uses three-row layout: title, big number + unit, status pill on the right.
- Below the contributors card: an `HRV Interpretation — Improving recovery trend — Your HRV balance and RHR trends indicate that your adaptation to training or stress is improving. Keep up the push!` text block.
- A `Sleep HRV Trend` chart: average HRV 54 ms / Max 93 ms with the **per-minute HRV line over the sleep window (1:03 → 7:48)** including dropouts ("Awake Period" tick mark, "WHY THE GAPS?" small button — opening a help sheet).

### 3.3 Sleep Index detail

- Top: same week-strip bar chart with current day highlighted.
- "84 Sleep Index" header.
- **Contributors** card with 2×2 tile grid: Total Sleep 6h 10m / Time in Bed 6h 50m / Restorative Sleep 42% / HR Drop 1:28 AM — each tile has a verdict pill underneath (Good / Good / Optimal / Optimal).
- Below the tile grid, an expanded list of contributor rows: Sleep Efficiency · Temperature (Below Range & Optimal) · Restfulness (Optimal) · Total Sleep · HR Drop · Timing · Restoration Time — each with a sliding progress bar and verdict text.
- **Sleep Stages** — a small horizontal strip (just stage transitions with tick marks at 1:03 AM / 3 AM / 4 AM / 5 AM / 7:53 AM).
- Below: stages legend with %: Awake 41m·10%, REM 1h 38m·24%, Light 3h 17m·48%, Deep 1h 14m·18%.
- **Time In Bed 6h 50m** with an edit pencil.
- **Stage hypnogram** — a richer one with 5-min squares coloured by stage. Tapping a square shows "Light Sleep · 4:28-4:53 · 0:25 · Tosses and turns · 2".
- **Sleep Cycles · 9** strip — small green capsules (4 Full · 5 Partial) showing cycle structure.
- **Movements** small bar chart at the bottom.

### 3.4 Heart Rate / HRV graph

A typical sleep HRV chart screen:
- Small bar at top with day picker.
- `84 Sleep Index` header.
- `Heart Rate` card: lowest 44 BPM (with a "Lowest HR Zone?" outlined chip — opens an explainer), avg 53 BPM, and the per-minute HR line over the sleep window with a pink area-fill.
- `Heart Rate Variability` card: "HRV Zone 37-77 ms / 7-Day Average Baseline 45 ms" plus a per-minute line chart between 1:03 and 7:53.

### 3.5 Stress Rhythm

A score detail screen:
- Week strip at top with 93, 89, 78 (today), 99 — 4 bars.
- "78 Stress Rhythm Score" header.
- **Breakdown** card listing phase periods: "Phase Dead · 12:15 PM - 11:15 PM · 2h 40m", with sub-rows Stressed 22% · 0h 35m, Stimulated 53% · 1h 25m, Relaxed 13% · 0h 20m, Activity/Sympathetic Activation 13% · 0h 20m. Each row has a coloured pill.
- A **stacked bar chart** of phase windows: Sleep / Minima / Phase Advance / Phase Dead / Phase Delay — each phase is a coloured vertical bar with red/blue/orange segments showing stress composition.
- Bottom info card: "Your Phase alignment calibration is underway, takes 7 days to calibrate circadian phases."

### 3.6 Resting Heart Rate trend

A dedicated trend screen:
- Title `Resting Heart Rate`, subtitle "Sunday · 20 Jul · 44 BPM".
- Line chart with three labelled points (Sat, Sat, Sun) — the line dips and rises.
- **Daily / Weekly / Monthly / Yearly segmented control** below the chart.
- "Score Contribution" big number `98 Optimal`.
- **Contributor Details**: Average last 7 days 94 (green), Community Average 71 (red), Top 10 Percentile Average 94 (green) — each a horizontal bar with the value at the right.
- "Tips to improve it further" card with an illustration (a woman sleeping by a window with a moon).

This is the screen that introduces **community comparison as a third reference frame** alongside personal baseline and 7-day average.

### 3.7 Skin Temperature

- Top of screen: a **half-arc gauge** with a small needle pointing to 0.0 (the "optimal zone" is a thin green band).
- A small day strip 9 / 11 / 13 / 15 / 17 / 19 / 21 with the current day highlighted by a vertical dashed line.
- "Skin Temperature — Sunday · 20 Jul · 7:45 AM — 35.15" headline.
- Toggle moon/sun icon — switches between sleep-time and daytime temp.
- A line chart of skin temp over the day with point dots.
- All Day / Daily / Weekly / Monthly tabs.
- Long-form explainer copy below the chart: "Skin Temperature — The Skin Temperature Factor is a vital component of the recovery score that evaluates the variations in an individual's skin temperature…"

### 3.8 Morning Alertness

A novel "how groggy you feel" inference:
- "Morning Alertness — 77 mins — 7 day average" plus a bar chart of morning alertness duration with an "Optimal Zone" highlighted band.
- Coaching paragraph: "Finding Inertia? You probably felt very groggy and disoriented for an extended period. If possible, look into your sleeping room temperature, have an early dinner, avoid full blackout curtains, and late evening coffee."
- Below: **Tosses and turns during sleep — 7** with a (i) help icon.
- **Average Oxygen Saturation — 97%** (Beta tag).
- **Temperature — Average 34.79 °C**.

### 3.9 Workout / Heart Rate Zones

- `Indoor Walking · 4:05-4:09 PM · 4 mins` header.
- "96 BPM AVERAGE HEART RATE" + "113 BPM MAX HR" two big numbers.
- **Workout Zones table**: 5 rows (Zone 1 / Zone 2 / Zone 3 / Zone 4 / Zone 5) with durations on the right (Zone 1 04:03, the rest 00:00). Zone 1 is highlighted in blue.
- A pill segmented control `Simple HR / Karvonen` to switch zone-calculation method.
- **Heart Rate line chart** below with the workout window (4:05 → 4:09) endpoints in pill bubbles, pink line, y-axis 80-120 BPM.
- Above the line chart: "How Heart Rate Zones Are Calculated" sheet appears as a tutorial, showing two side-by-side method cards (KARVONEN METHOD / SIMPLE HR METHOD) with the inputs each uses and arrows pointing to "TARGET HR" then to the colour bar Z1-Z5.

A live-workout screen during the workout:
- Top: small grey "Indoor Walking" with timer in orange.
- "Using significant energy" small pill.
- A **multi-coloured tri-arc ring** (each arc is a HR zone) with 109 BPM in the middle, the current zone highlighted ("Zone 2 · 106 - 118 BPM" in cyan along the arc).
- An `End Workout` red button.
- "Do you want to end the workout?" Cancel/Yes confirmation modal.

### 3.10 Breathwork / Guided Sessions

- A pulsating gradient orb in the centre with "Hold — Hold your breath" / "Breathe Out — Exhale fully" instructional text.
- Bottom strip: ❤ 87 BPM / 🌡 89.93°F + a "HR Zone Balanced" badge inside a green-outlined chip.

### 3.11 Cyborg Insights (food)

- "Plain Yogurt" food card.
- "Estimated glucose response from the Ultrahuman cyborg community".
- A **community-aggregate dial** "59% of users got a stable glucose response from one or more items" inside a multicolour gradient ring.
- A "How to optimise?" section.
- Below: a "Food Optimisation AI" card (long-form ChatGPT-style tips for that food).
- A `Metabolic Education` video tile carousel ("Why You Should Track Time In Range", "Tips To Control High Blood Sugar", "Metabolism — The Secret To Staying Young") with thumbnails.

### 3.12 Profile / Settings

Long list of rows:
- **UltrahumanX Store** banner (5 NEW pill).
- Ring Order History — All Ring Orders, Transfer Ring & Add-Ons.
- Workout Settings — Workout HR Zones (personalise zones).
- My Data — Connect Other Apps (read/write health data integrations).
- Notification settings.

### 3.13 Novel Ultrahuman moments

- **Big number with verdict pill on the right** as the contributor row primitive.
- **Community comparison** as a baseline (top 10 percentile / community avg / your avg).
- **Stress Rhythm** as a separate score from acute stress — phase-alignment metric tied to circadian biology.
- **Tri-arc heart rate ring** during workouts.
- **Sleep-HRV per-minute line chart with awake-period gap markers** ("WHY THE GAPS?" button).
- **Food cards with community glucose response aggregates** plus an LLM-generated optimisation tip.
- **Half-arc gauge with a needle indicator at a particular zone** — pointer pattern used consistently across score detail screens.
- **Phase Dead / Phase Advance / Phase Delay** circadian-phase terminology rendered as a bar chart.

---

## 4. Apple Health / Apple Fitness

Apple's apps are restrained and rely on a few foundational primitives.

### 4.1 Apple Health — Summary

- Top: large `Summary` title with a profile avatar in the top right.
- **Favorites** section — user-edited list of pinned metrics, each row: icon + name on top, date in top-right, value with unit below.
- **Show All Health Data** row at the bottom.
- **Highlights** section — single-card insight: "Walking + Running Distance — Over the last 7 days, your distance walked and run averaged 0.38 mi a day." followed by a thin bar chart with the average underlined.
- **Get More From Health** — onboarding/promo cards ("Set Up Your Medical ID", "Access Your Records", "Health Checklist — Make sure the Health features on your iPhone are set up the way you want them").
- A **bottom-floating search pill** at the very bottom of every Summary/Browse page lets you find any metric quickly.
- The Sleep Score card uses a multi-arc donut with three colour segments (Duration / Bedtime / Interruptions) — sub-text "Your sleep wasn't really interrupted last night and that led to an 84."

### 4.2 Apple Health — metric detail

- `< Summary` back, metric title centred ("Steps", "Walking + Running Distance", "Blood Pressure"), `Add Data` button on the right.
- A **D · W · M · 6M · Y** segmented control directly under the title.
- A large **bar/line chart** filling the upper half of the screen, with the X-axis days/months and the value scale on the right (right-aligned y-axis is an Apple convention).
- The chart shows the **highlighted day/week column** in the brand-orange (or whatever the metric's colour is).
- Below the chart: a `Highlights` section repeated again with a "Show All" link, then a `Data` section with raw sample rows.
- The Steps trend page has "TOTAL · 4,015 steps · Yesterday" floating just below the chart as a sticky context line.

### 4.3 Apple Health — Cycle Tracking on Summary

A compact card "Cycle Tracking — Medium Flow, Bloating, and 97.50°F — Today" with a small abstract avatar showing flow + symptoms in a compact glanceable summary.

### 4.4 Apple Fitness — Activity Summary

- Top: `Today, Sep 25, 2025` + calendar icon + share icon.
- A horizontal **week strip** at the top with each day as a small empty/filled ring, the current day labelled with a red "T".
- Below: a giant **3-ring** (Move / Exercise / Stand) with `0/250 CAL` Move label underneath. The ring colour is brand-red on dark.
- A "12:00 / 6:00 / 12:00 / 6:00" 24-hour move-pulse strip beneath, similar to a Strava per-minute strip.
- Sub-rows: Steps / Distance / Flights Climbed.
- Sticky tab bar at the bottom: Summary · Workout · Sharing.
- Long-press on the ring opens "Adjust Goal for Today / Change Daily Goal" mini menu.

### 4.5 Apple Fitness — customisable Summary tab

Newer Fitness has an "Edit Your Summary" mode — each module (Activity Ring, Step Count, Step Distance, Sessions, Awards, Trends, Workout) becomes a card you can show/hide with a `(−)` button in the corner.

The Trends card is a 2x2 grid: Move / Walking Pace / Distance / Running Pace, each with a thin sparkline and a colour bar (red ↘ for declining, purple → for stable, etc).

### 4.6 Apple Fitness — Awards calendar

A **monthly calendar of rings** — every day in the month rendered as a tiny activity ring; days with full rings glow, days with partial rings show their fill, missed days are empty. Tap a day to drill into that day's detail.

### 4.7 Apple Fitness — Workout history detail

A dated view (`Tuesday, Apr 11, 2023`) with the day's ring, Move/Exercise/Stand sub-strip, Steps/Distance/Flights Climbed sub-stats, and a list of completed workouts in a "Workouts — Show More" card.

### 4.8 Novel Apple moments

- **Pinned + Highlights structure** — every screen is either "stuff you said you care about" or "interesting things we noticed". Two sections only.
- **Highlights as English sentences with embedded numbers** — "Over the last 7 days, your distance walked and run averaged 0.38 mi a day."
- **Single-segment day chart with a labelled current selection** ("TOTAL · 4,015 steps · Yesterday" just below the chart).
- **Monthly ring calendar** as a visual streak indicator.
- **D · W · M · 6M · Y** segmented control — the de facto standard across the industry.
- **Floating search pill** at the bottom for jumping to any metric quickly.

---

## 5. Garmin Connect

Garmin's app is rich in metrics. Mobbin's direct Garmin Connect coverage is thinner than Whoop/Oura/Ultrahuman; the patterns called out below are inferred from documentation and the closest comparable screens (Outsiders training app surfaces and Bevel show similar primitives).

### 5.1 Body Battery

A 24-hour line chart of "energy reserves" from 0-100, with peaks (recovery) and dips (stress/activity). Annotations along the line at notable events ("Sleep ended", "Workout") and a "Currently 67 of 100, Charged 7% in the last 30 min".

### 5.2 Training Status

A categorical status pill (Productive / Maintaining / Unproductive / Overreaching / Detraining / Peaking / Recovery) with a **VO₂ Max trend** plot in the background. Below: 4 mini-cards for VO₂ Max, Recovery Time, Training Load, Acute Load.

### 5.3 Sleep Detail

- Sleep Score 0-100 with a small ring.
- **Sleep stages bar chart** (Awake / REM / Light / Deep) with the user's session colour-coded by minute.
- A **Sleep Need vs Actual** comparison.
- Below: Body Battery during sleep + Stress during sleep + Respiration + SpO₂ + Skin Temperature — each as a small chart inside an accordion row.

### 5.4 Stress

- A 24-hour stress-level line chart (0-100, banded Rest/Low/Medium/High) with auto-detected rest periods, and a "Today: 32 / Average yesterday: 28" comparison.

### 5.5 Patterns observed in Garmin-style apps

- **Categorical performance state** rather than a single number — "Productive" is more actionable than "87".
- **Body Battery as a single charge metric** rather than separate strain/recovery.
- **All-day stress with rest detection** that lets users see whether their breathing/HRV was elevated outside workouts.

---

## 6. Fitbit

### 6.1 Today

A long scroll dashboard:
- **Active Zone Mins** ring with "Zone Mins" inside, big number + small icons for Steps / Distance / Cals below.
- **Stress Management** score (0-100) with a small icon and "Log how you're feeling +".
- **Sleep card** showing "5 hr 46 min · 80 Sleep Score" with a colour-coded `Bedtime → Wake Up` timeline strip and stage stack underneath: Awake 11% 41min / REM 20% 1h 19min / Light 51% 3h 18min / Deep 18% 1h 9min.
- **Readiness** card with a half-arc gauge (Premium feature) — "Good readiness — You've been more active lately…" + an Active Zone Minutes line chart below.

### 6.2 Sleep Detail

- **Hours in Sleep Stages bar chart** — daily stacked bars REM/Light/Deep/No Stages across a week.
- Per-day rows below the chart with timestamps + score circle on the right (Today 3:09 - 9:23 76 Fair, Wed 2:57 - 9:24 80 Good etc).
- A "Monthly Sleep Profile" card that becomes a "sleep animal" archetype (giraffe / hedgehog / parrot / dolphin / bear / tortoise) after 14 nights logged — a quirky way to communicate consistent patterns.

### 6.3 Sleep Score detail

- Big circular score (e.g. 88 Good) on a deep-purple gradient background.
- Contributors as horizontal-bar rows: Time Asleep 45/50, Deep and REM 22/25, Restoration 21/30 — each row with score-out-of-max.
- A first-time intro overlay "Tap into a card to view more sleep details".
- **Sleep Stages 30-Day Avg** chart — your night vs 30-day avg as two side-by-side bar groups with each stage as a coloured cell.

### 6.4 Sleep Schedule yearly

- Year view shows a **D · W · M · Y** segmented control.
- A bar per month showing average sleep duration plus a line at the goal (8h).
- Filters: Duration / Score / Schedule / Deep sleep dropdown selector — letting you change what the bars represent without leaving the screen.

### 6.5 Target HR Zones

A full-screen line chart with "Below zones / Fat burn / Cardio & Peak" pill row above, the heart rate line over the day, and a callout bubble "168 bpm · Cardio & Peak zone · 7:56 PM" pinned to the highest point. A coaching paragraph below: "At 70-100%% of your max heart rate, you're likely in a vigorous activity such as a run or all-out sprint…"

### 6.6 Reflections

A `Reflections` mini-journal — the day's score ring + 3 contributor bars (Responsiveness 21/30, Exertion balance 32/40, Sleep patterns 28/30) + a single emoji "Neutral 11:19 PM" log entry + a "Log reflection +" CTA.

### 6.7 Novel Fitbit moments

- **"Sleep animal" archetype** — qualitative monthly persona based on patterns (a brand-led pattern that became iconic).
- **Score breakdown as duration/quality/restoration thirds** with explicit weights ("Time slept · 40% of score") — they show how the score is computed.
- **Pinch-zoom callout on the HR line chart** ("168 bpm Cardio & Peak 7:56 PM") with full sentence context.
- **Daily reflections diary** that pairs the score with a self-reported mood pip.

---

## 7. Strava (training-load reference)

Strava's "You" tab is the cleanest training-load UX on the platform.

### 7.1 You / Progress

- Top: Profile photo + `Progress · Activities · Profile` segmented tabs.
- Weekly day strip (Mon-Sun).
- **Weekly Intensity** chart "Your training load based on heart rate or perceived exertion data" — three-line overlay (This Week / Last Week / Suggested Range from 3-Week Average) — the suggested-range is a dashed purple band, the current week is solid red, last week is grey.
- **Monthly Fitness** card — "Your training and recovery added up over time", with a single line tracking fitness over months, the current value labelled in a callout bubble (`2`), and a "1 Month · 3 Months · 6 Months · 1 Year · 2 Years" segmented control above the chart.
- **Training Log** — a tiny weekly heat map (`M T W T F S S`) with coloured triangles on days the user trained.

### 7.2 Relative Effort

- A red full-screen card "17 — Well above weekly range — You've made a substantial jump compared to previous weeks. Be cautious of overtraining and give yourself ample recovery time."
- A 7-bar bar chart (`M T W T F S S`) showing each day's contribution.
- **Swipe to see past weeks** + a chevron < > navigation under the chart.
- Below: a long horizontal line chart spanning Dec / Jan / Feb with a marker at the current week — letting the user see acute spike in the context of the macro trend.
- Below that: this-week activities list (each activity row: name, duration, effort score in red on the right).

### 7.3 Per-activity Relative Effort

When tapping into an activity, the "Relative Effort" view shows three coloured bands — `Higher than average` (red) / `Your 3-week average` (purple) / `Lower than average` (light purple) — with a vertical slider mark showing where this activity falls. A "View Weekly Effort" link drops the user back into the chart.

### 7.4 Novel Strava moments

- **Suggested Range as a dashed band** on the same chart as actual values — implicit coaching without a separate explainer.
- **Time-axis nesting** — small daily heatmap inside the weekly view inside the monthly view inside the yearly chart, all on the same screen.
- **Red full-screen alarm card** when Relative Effort jumps too far — confrontational coaching design.

---

## 8. Bevel — modern challenger with great patterns

Bevel is interesting because it lifts the best of Whoop / Oura / Ultrahuman into a brighter, more friendly aesthetic and is worth mining heavily.

### 8.1 Home

- Top: date dropdown + "Active Until changed" pill (state selector — Active / Sick / Resting / Travelling).
- **Three-ring row**: Strain (orange) · Recovery (green) · Sleep (purple) — each a small ring with the % in the centre.
- Below: an "📢 Prioritising Recovery — It's 1:55 PM, and your Recovery is at 40% today, which is lower than your usual. This is a clear signal to prioritise rest. Given your goal…" coaching card (expandable with an arrow).
- **Stress & Energy** section: today's stress as a 3-stat row (Highest 36 / Lowest 6 / Average 11) + a small radial half-arc score (e.g. 36 Med) and a horizontal `⚡ 67%` energy bar (their "Energy Bank" — a battery-style accumulator).
- **Nutrition** section: "Today's foods · Blood glucose – mmol/L" with a 4-bar food-type strip (carbs / protein / fat / fibre).
- A floating "+" button reveals: Describe food / Import food / Capture food / Scan food / Ask Bevel / Search food / Generate templates / View templates / Log activity — a really wide creation radial.
- Tab bar: Home · Journal · "+" · Fitness · Biology.

### 8.2 Recovery (full-screen)

- Hero: a circular **77% Recovered** ring overlaid on a soft mountain illustration with parallax.
- Two small tiles below: Resting HRV 55.2 ms / Resting HR 62.0 bpm.
- **Coaching card** with emoji + bold headline + paragraph + an "expand" affordance: "😴 Getting Enough Sleep Is Key — It looks like your Sleep Score dipped to 67% last night, a bit lower than yesterday's 77%. While your time asleep was a healthy 6 hours and 26 minutes, your Respiratory Rate also dropped to 14.1 breaths/min, which is below…"
- **View insights →** button.
- Timeline section listing today's events: "Primary sleep 14/09/25 at 1.01 AM · 67 score chip".

A scroll-deep view of Recovery has a card per metric, each with: metric name, today's value, "Normal range" status pill, and an inline sparkline:
- Recovery Score 61% · Normal range · sparkline
- Resting HRV 64.2 ms · Normal range · sparkline
- Resting HR 58.9 bpm · Normal range · sparkline
- Respiratory Rate 15.7 rpm · Normal range · sparkline
- Oxygen Saturation 95.4% · Below normal · sparkline (red dot at end)
- Wrist Temperature 35.2 °C · Normal range · sparkline

### 8.3 Sleep detail

- **45% sleep score** in a small purple ring with the time in bed and time asleep underneath.
- Coaching paragraph: "You had poor sleep last night. Your REM sleep is lacking. Try to stick to a consistent sleep schedule and wind down properly."
- **Sleep Contributors** rows with progress bars: Time asleep · Poor / REM sleep · Poor / Deep sleep · Good / Heart rate dip · Excellent / Sleep efficiency · Fair.
- Hypnogram below.
- A `Sleep Recap` collapsible pill at the bottom of the screen (sticks while you scroll) — once tapped, expands into a multi-card recap.

### 8.4 Sleep metric drill-down

- "Primary sleep 12/09/25 at 11.27 PM" header.
- A specific metric (Heart Rate / HRV / Respiratory Rate / SpO2) selected via 4 pill tabs.
- **HRV detail**: "Sleeping HRV — 60.8 ms AVERAGE HRV" + a line chart from 1:24 AM → 5:24 AM.
- **Respiratory Rate detail**: similar — "Sleeping Respiratory Rate — 14.5 rpm — 4.41 AM" with a per-minute scatter line.
- **Time To Fall Asleep**: a thumb-slider with three labels Fast / Normal / Late — a clever way of showing where you fall in a categorical scale ("8 minutes — Normal").

### 8.5 Strain

- "Strain Score — 40% — Aug 2025 · Normal range" with a line chart over 1Y showing the curve rising in recent months.
- Pill tabs `Strain Score · Exercise Duration · Daytime HR`.
- Strain Breakdown stacked bar: Low (yellow 4-34%) · Normal (orange 34-67%) · High (red 67%+).
- A pinned "💪 Strain Check-in" collapsible expansion handle.

### 8.6 Biology tab

- Lab-style header `Biology`.
- VO₂ Max 29.9 Fair with a horizontal gradient bar and the current value as a dot.
- HRV Baselines 57.5 ms No trend / RHR Baselines 68.2 bpm Poor with mini scales.
- Weight 61.0 kg Decreasing with a line chart and a − +/− stepper.
- Lean Body Mass / Body Fat 25.0% Acceptable with a gradient zone bar.
- Sticky bottom tab.

### 8.7 Vitals row on home

A compact 6-tile "vital pills" strip — each tile a vertical mini-bar where the current value sits as a dot in a coloured range: RR 15.0 / RHR 63.2 / HRV 94.2 / SpO2 – / Temp – / Sleep 7:01 hrs. The mini-bar style is a great way to show "in/out of range" at a glance without taking much space.

### 8.8 Ask Bevel (LLM chat)

A bottom-sheet that floats over the current home, offering a "Personalising Training Guidance" suggestion chip. The chat tries to be conversational and uses today's data as in-context priors ("How do I improve my VO₂ Max?" → uses the user's current stats).

### 8.9 Novel Bevel moments

- **State selector pill at the top** ("Active / Sick / Resting / Travelling") — a non-binary alternative to a Rest Mode toggle.
- **Energy Bank** — a battery-style 0-100% accumulator alongside the daily stress strip.
- **Mini vertical-bar vital tiles** with a coloured range and a current-value dot — extremely glanceable.
- **Categorical thumb-slider** for "Time to fall asleep" (Fast / Normal / Late) — a chunked-not-continuous value display.
- **Sticky bottom collapsible "Sleep Recap" / "Strain Check-in" pill** that doesn't take up space until expanded.

---

## 9. Visible (chronic illness pacing app)

Visible is interesting because it borrows heavily from Whoop/Oura but for a much narrower population (long COVID / ME/CFS). Their "Morning Stability" screen is the cleanest single-score detail surface in the category.

### 9.1 Morning Stability

- Half-arc ring with a big number `4` in the centre — value 0-5.
- Verdict text "Looking stable" + paragraph "You're at a stable baseline. If you've been pacing well, this is good news. Keep it up."
- **Your score summary** section.
- **Three "contributor explanation" cards** that expand:
  - "Your HRV is stable, and is within its normal range" — expanded shows a horizontal range strip "HRV 53" with marker between 52 and 73 (the normal range endpoints).
  - "Your Resting HR is lower than your recent average, and is within its normal range" — expanded shows a small directional arrow icon (↘) and the same kind of inline range.
  - "Your sleep quality was similar to your recent baseline".
- A sticky **Done** button at the bottom — this is presented as a daily-checkin modal.

### 9.2 Why it works

- A score on a 0-5 scale (not 0-100) — better for a population that can't tolerate volatility.
- Each contributor is a **plain-English sentence with an explicit direction word** (stable / lower / similar) + the actual value when expanded.
- Range strip with two endpoints labelled — instantly communicates whether the value is borderline or central.

---

## 10. Eight Sleep / Pillow / TIDE (sleep-only apps for hypnogram reference)

These apps are useful only for sleep-detail patterns.

### 10.1 Eight Sleep

- "Sleep Fitness Score" 86 In range • with D · W · M · 6M · Y pill segmented control.
- Big radial half-arc gauge with the score.
- **Score Contributors** as rows with weight pills: Time slept · 40% of score · 100% · "Total time spent asleep". Quality · 50% of score · 77% · "REM sleep, deep sleep, wake episodes, and heart rate trends". Consistency · 10% of score · 76% · "Regular bedtime and wake-up schedule".
- The **weight pill** ("40% of score") next to each contributor is a great pattern — shows the user how the score is computed without an FAQ.

### 10.2 Pillow

A black-purple aesthetic. Sleep stages are rendered as:
- Top hypnogram bar (4 stages in distinct hot colours — orange, pink, green, blue).
- 4 large stat cards stacked vertically: Awake 2h 30m / R.E.M 22m / Light Sleep 3h 15m / Deep Sleep 1h 30m — each with its own coloured side bar, the % of session, and a small "High / Low / Normal" tag.
- A "Report a problem ⚠" subtle row at the bottom of every detail page.

### 10.3 TIDE

A meditation app with sleep tracking. Their sleep detail uses a `S M T W T F S` day strip at the top + a "Today · 10 February" date row + a downward-pointing chevron to expand. Sleep Score "86%" in a big number with a soft sine-wave below it. Then `Sleep Efficiency 95% · Sleep Duration 8h 3m · Target Achieved 100%` three columns. Below: the hypnogram + sleep efficiency expanded card.

The take-away: sleep apps cluster around (a) a single big score, (b) a hypnogram, (c) per-stage durations stacked vertically with %, (d) a contributors list.

---

## 11. The Outsiders (training-focused alternative)

A training app surfaced via Mobbin. Its progress tab is one of the more interesting "intensity distribution + fitness trend" combos:

### 11.1 Progress tab

- Top: `Intensity Distribution` card with three values across:
  - Low Aerobic 44% BELOW
  - High Aerobic 32% ABOVE
  - Anaerobic 25% ABOVE
- Below: a **horizontal stacked bar (yellow/red/purple)** showing the actual distribution + a smaller bar above showing the suggested target — easy visual "you're over-cooked".
- Then a "Heart Rate Zones" thin horizontal bar with 5 colour segments.
- **Fitness** section with cards:
  - Endurance Fitness 27 chronic load · FAIR + small olive sparkline.
  - Cardio Fitness 32.6 · Sep 23 + sparkline.
- Bottom tab bar: Today · Progress · Workouts.

### 11.2 Training Load chart

- A `Training Load Ratio` red-tinted card with the day's ratio (1.88) + "HIGH RISK OF INJURY" warning.
- A sparkline of the ratio over the past month.
- **Wellbeing — Body Metrics** mini-grid: HR 63 bpm / HRV 58 ms / Temp 35.7°C / RR 15 / SpO2 97% — each is a tiny tile with a coloured sparkline behind the value.

### 11.3 Endurance Fitness drill-in

- Title "Endurance Fitness 27 chronic load" + a paragraph "You're building a base with light-to-moderate training. Gradual increases in volume or intensity will support further endurance gains."
- View selector dropdown: 7 days / 4 weeks / 6 months.
- Long line chart on the 6-month view with **labelled inflection points** (39 +11% / 43 +10% / 45 +5% / 39 −7% / 30 −29% / 28 −7%) showing percentage change at each peak/trough.
- The chart has a green band for "Good" and a yellow band for "Fair" running horizontally as ranges.

The take-away: the **fitness chart with inflection-point % labels** plus the **"Good / Fair / Low" coloured bands as horizontal references** are two patterns directly relevant to noop's trends screens.

---

## 12. Patterns synthesised

Twelve apps later, the design vocabulary that recurs across the category is surprisingly tight. Below are the rules of the genre — i.e. what every production app converges on for each surface.

### 12.1 Score + verdict + sentence

Every score detail screen opens with the same triad:
1. A **big number** (with %, units, or a 0-100/0-21/0-5 scale).
2. A **categorical verdict** ("Optimal / Good / Fair / Pay attention" — Oura, Visible) **or** a colour (yellow/green/red on Whoop) **or** a one-line headline ("Balanced Strain", "Solid Recovery", "A good night's sleep").
3. A **personalised paragraph** of 1-3 sentences explaining the number using today's specific data ("Your HRV (39 ms) and RHR (56 bpm) are within their usual ranges which resulted in a solid recovery.").

The paragraph is what makes the screen feel intelligent. None of these apps use a generic "Your recovery is high" template.

### 12.2 Contributor list

After the hero, every score breaks into 3-7 contributors, each rendered as a row with:
- An icon on the left.
- The contributor name.
- The today's value (big-ish).
- Either a coloured horizontal bar showing where it falls in a personal range (Oura, Bevel, Eight Sleep, Visible) **or** a smaller baseline value with a delta arrow underneath (Whoop), **or** a verdict pill on the right (Ultrahuman, Apple).
- A `>` chevron to drill further.

This is the **most reused primitive in the category**. noop should standardise on one variant and use it for every detail screen.

### 12.3 Two reference frames at minimum

Every app shows the current value against at least one reference. The best ones show two:
- WHOOP: vs previous 30 days **and** vs last 7 days as separate sections on the same screen.
- Oura: vs personal normal range as a bar fill, plus a 7-day chart below.
- Ultrahuman: personal baseline **and** community baseline **and** top-decile baseline (`Top 10 Percentile Average`).
- Visible: "within its normal range" + "lower than your recent average" — both phrased verbally on the same row.

The "single number with no reference" is gone. Even Apple Health includes a Highlight sentence comparing today to "the last 7 days".

### 12.4 The chart + scrubber + anchored caption

Every trend chart in the category has:
- A **D · W · M · 6M · Y** (or D · W · M · Y) segmented control above it.
- **Point labels** above bars/points to avoid forcing a scrub (Whoop). Or **tap-and-hold scrubber** that shows a callout bubble with date + value (Fitbit, Ultrahuman, Strava).
- A **highlighted "today" column** rendered as a translucent grey strip behind the bar (Whoop's universal pattern).
- A **caption sentence below the chart** that interprets the trend in plain English ("A downward resting heart rate trend implies that you've recovered well…" — Oura).

### 12.5 The day-strip mini-scrubber at the top

A consistent affordance:
- WHOOP: `< TODAY >` with a calendar popover.
- Oura: arrows + date label.
- Ultrahuman: `SAT 19 / SUN 20 / TODAY` swipe strip.
- Bevel: a date dropdown.
- Apple: prev/next chevrons.

In Oura and Ultrahuman this strip is also a **mini bar chart** — each day's score height is the bar height for that day — so the strip is both a navigator and a sparkline.

### 12.6 Hero ring / gauge

Every recovery/readiness/sleep score uses some variant of:
- **Full circle ring** (Whoop, Apple, Fitbit) — % filled around 360°.
- **Half-arc gauge** with a needle (Oura, Whoop Stress, Visible, Bevel) — better at communicating zones.
- **Multi-arc segmented donut** (Apple Sleep Score, Fitbit Stress Mgmt) — useful when contributors are categorically weighted.

Apple and Oura use a thin white stroke; Whoop fills the arc with the colour at full opacity; Ultrahuman puts the score as left-aligned big text with a small bar chart instead of a ring on score-detail screens.

### 12.7 Colour encoding

Universally:
- Green = good / optimal / in range / recovered.
- Yellow / amber = okay / fair / approaching boundary.
- Red / orange = pay attention / below normal / outside range.
- Blue = strain / activity / cognitive load (not bad-or-good, just intensity).
- Purple = sleep, mostly.
- Pink / magenta = HRV / heart rhythm specifically (Ultrahuman).
- White-on-black is the dominant theme for Whoop / Ultrahuman / Oura / Bevel; light themes show up only in Apple Health, Fitbit, Bevel mood/wellness variants, Strava.

When a metric has no inherent good/bad direction (strain, calories), apps use a **gradient zone bar** with named bands (Light / Moderate / Strenuous / All Out — Whoop; Low / Medium / High — Apple, Oura) instead of a single colour.

### 12.8 Journal / tags

Every serious app has some form of behaviour logging:
- **Yes/no checklist with conditional follow-ups** (Whoop).
- **Pill-based tag chooser with search + suggested tags + all tags** (Oura).
- **Sick/Active/Resting/Travelling state selector pill** at the top (Bevel).
- **Reflections diary with a single emoji + free text** (Fitbit).
- **"Add a tag" inline on every detail screen** so the user can log context to that day (Oura, Ultrahuman).

The behaviour list needs to be deep — WHOOP has 100+ behaviours, Oura has ~100 tags, and both have category filters (Lifestyle / Circadian / Health Status / Sleep / Status).

### 12.9 Insights as "X% impact"

The "what helped vs hurt" output is the strongest insight pattern:
- **Whoop's Recovery Impact Analysis**: behaviour as a row, %-impact as a coloured bar from a 0% centre line. Hurts on the left, helps on the right.
- **Oura's tag-aggregate**: "Members who tag X see Y% change in Z".
- **Ultrahuman's community percentile**: "Top 10% / Community Average / Your Average" 3-bar comparison.

These are all variants of "your N is M because of behaviour X" — the **causal sentence**. None of them claim causality strongly (they say "see an average X% decrease") but they all hint at it.

### 12.10 Coach / chat as explanation pattern

WHOOP Coach and Bevel's "Ask Bevel" use an in-app LLM chat that's seeded with the current screen's context. The pattern:
- A button on the detail screen ("Chat to learn about Recovery").
- Opens a chat with pre-seeded suggested questions ("What activities can I do to improve my Recovery?").
- The assistant cites today's data ("Your average Recovery of 53%…") and references articles inline (carousel of "ARTICLE" cards after the response).

The chat is **always tied to a metric** — there's no general "open chatbot" button. Every score detail's tail-end CTA is "ask me about this".

### 12.11 Coaching cards and explainer cards

Two distinct patterns:
- **Coaching card**: shaped like the rest of the score cards but with a different border colour (purple or rainbow) and a "What is X?" headline + a 1-line explainer + a chevron. These are educational — they answer "what does this number mean?".
- **Insight card**: shaped like a list item with an icon, a bold headline (often an emoji + word), a sentence of advice, and a "View insights →" or "Expand ↗" affordance.

Both are easily distinguishable from a data card by the **border treatment or background gradient**.

### 12.12 Empty / calibrating states

Every app has a "still calibrating" mode and it's a meaningful UX:
- WHOOP: "Calibrating range" sub-label inside every Health Monitor tile until the strap has gathered enough data.
- Oura: "Activity ring 3 Active calorie burn" with greyed-out daily movement chart when no activity yet.
- Ultrahuman: "Your Phase alignment calibration is underway, takes 7 days to calibrate circadian phases."
- Bevel: "Recovery is 0% — no data yet" instead of a 100% empty ring.
- Visible: "Looking stable" even when score is just baseline.

Three rules emerge:
1. Never show 0/empty — show a calibration message and a count of days left.
2. Use a different visual (greyed ring, dashed line) so it's distinguishable from a "real" zero.
3. Tell the user **how much more data is needed** and **why** (e.g. "7 days to calibrate circadian phases").

### 12.13 Notification / coaching tips

Most coaching is delivered inside the app as small "what to do" cards anchored to today's data — not as push notifications. The notifications themselves are short ("Your Recovery dropped from 67% to 40% — open the app to see why"). Apple's Stand reminder, Whoop's strain-day push, and Oura's morning-readiness push are the only patterns where the notification is the primary surface.

In-app coaching tips appear in 3 places:
1. **Inline as a coaching paragraph** on the score's detail page (Whoop, Oura, Ultrahuman).
2. **As a card in the home feed** ("Solid Strength Session!" — Bevel; "Prioritising Recovery" — Bevel).
3. **As a chat exchange** when the user asks (Whoop Coach, Bevel chat).

### 12.14 Settings / privacy

Universal categories:
- Notifications / push
- Goals / targets
- Integrations / data sources (Apple Health, Google Fit, third-party apps)
- Data export / share with doctor
- Coach / AI assistant settings
- Journal customisation
- Hide metrics (WHOOP-style — let user opt out of seeing or sharing certain values)
- Subscription / store

The **printable health report** ("Share Your Health Report — Printable report for sharing with your doctor, physician, trainer, or anyone of your choosing") is a really nice convergence point — every major app supports a one-tap PDF for clinical sharing.

### 12.15 Cross-cutting micro-interactions

- **The floating "+" creation button** opens a radial / list of "what can I create" (Whoop = activity + journal + strength trainer; Bevel = food + activity; Oura = unguided session + tag + workout). The radial is usually invoked from the home tab.
- **A small grey "today" column** highlighted on every 7-day chart removes the need to think about which bar is today.
- **A small (i) info icon** in the corner of every metric ring opens a modal that explains the metric.
- **A small share icon** in the corner of every score lets the user share a stylised image of today.
- **Pull-to-refresh** is universally implemented but barely surfaced visually — most apps refresh data when the user opens the screen.
- **Day picker is global** — once changed, every tab inherits the date.

### 12.16 Information density per screen

Across the category, secondary screens average:
- 1 hero (score + ring + verdict + sentence) — top third.
- 3-7 contributor rows — middle third.
- 1-2 educational/coaching cards — middle-bottom.
- 1-3 trend charts (small or full-width) — bottom third.
- A sticky "Chat about this" button or a list of suggested follow-up questions — at the very bottom or floating.

What's tap-discoverable: every contributor row drills into a per-metric detail. Every chart's points/bars are tappable for that day's drill-down. The (i) icon explains. The "+ Add a tag" CTA logs context.

What's not on the screen unless tapped: the raw time-series, the per-event detail (e.g. that specific REM cycle), the historical comparison beyond 30 days, the community percentile (some apps show, some hide).

### 12.17 Recurring failures to avoid

Patterns the worst examples in the dataset show — and that noop should avoid:
- **A score with no reference frame** — feels arbitrary.
- **Charts without point labels and without a scrubber** — forces guesswork.
- **A "what is this?" link as the only explanation** — the user has to leave the screen to learn.
- **Pure-categorical badges with no number** — robs the power user; pair the badge with the value.
- **Goal-completion rings that go to 100% and stop** — when a user surpasses the goal, the visualisation should keep going (Apple, Whoop, Bevel all do; some legacy fitness apps don't).
- **Mixing time scales on one screen without a control** — having a daily HRV chart next to a monthly trend without a D/W/M selector confuses the eye.

---

## 13. Direct implications for noop

(Brief — not in the deliverable but worth keeping with the doc.)

- Adopt the **dual-baseline contributor row** (today value + 7-day delta + 30-day delta) for every metric on Recovery / Strain / Sleep / Stress / Health.
- Default to **point-labelled charts** for 7-day views (Whoop's pattern) and add a **scrubber** for >7-day views (Fitbit / Ultrahuman pattern).
- Build a **global day-picker scrubber** at the top of every secondary screen so date is shared across tabs.
- Every score's hero needs: ring → verdict word → 1-2 sentence personalised paragraph that uses today's numbers.
- The journal should support **both** yes/no questions with conditional follow-ups (Whoop) **and** pill tags (Oura) — they cover different mental models.
- The Insights screen should be a **"what helped / what hurt"** chart anchored to behaviours (Whoop's Recovery Impact Analysis is the gold standard).
- Sleep detail needs: HR-over-night line + per-stage stacked bars with hatched typical-range overlay (Whoop's #1 differentiator).
- Stress detail needs: half-arc gauge with needle (current value) + 24-hour line chart with sleep/workout markers + a stacked time-in-zone bar vs. last-7-day average.
- Trends screen should be a grid of square mini-cards (each metric · sparkline · 7-day avg · delta) that drill into the long-form per-metric trend (Oura pattern).
- Settings should have the universal categories above, plus a "Share Health Report" PDF export.
- Empty/calibrating states must explain **why** and **for how long** — never "0%".

---

End of research document.
