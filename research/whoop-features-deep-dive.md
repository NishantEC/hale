# WHOOP Features — Deep Dive

A reverse-engineering / feature parity reference for the WHOOP wearable ecosystem (WHOOP 4.0, WHOOP 5.0, and WHOOP MG, as of mid-2026).

The goal is to enumerate every shipped feature, its inputs, the published methodology (or the closest peer-reviewed analog where WHOOP keeps it proprietary), validation evidence, and an honest gap analysis vs. our own stack. Existing topics already covered in `RESEARCH_KNOWLEDGE_BASE.md` (sleep staging primitives, HRV computation, PPG processing, respiratory rate, SpO2, skin temperature, strain/TRIMP, recovery scoring, longevity indices) are not duplicated here — only the WHOOP-specific product/algorithm shape is added.

---

## 0. Executive summary table

| Feature | Inputs WHOOP uses | What WHOOP publishes | What we currently ship | Gap to close |
|---|---|---|---|---|
| **Day Strain** (0–21) | Continuous HR, HR-zones (HRR method), muscular load (IMU + Strength Trainer or auto-estimate) | Borg-RPE inspired, logarithmic, weighted by time in zones; HR-max via Gellish nonlinear and learned correction; muscular load fused | TRIMP-style strain, no muscular fusion | Add Strength Trainer rep detection + muscular load fusion; switch HR-max to learned Gellish |
| **Recovery score** (0–100%) | Sleep HRV (RMSSD, last-deep-sleep window), nocturnal RHR, sleep performance, RR, SpO2, skin temp | Weighted; ~70% HRV / 20% RHR / 10% sleep per third-party reverse-engineering; thresholds 0–33 red / 34–66 yellow / 67–100 green | Recovery score with HRV+RHR+sleep | Add RR/SpO2/skin-temp baseline deltas as modifiers |
| **Sleep Need / Sleep Coach** | Baseline (physiology), strain, recent debt, naps, recent sleep hours, circadian inferred from prior weeks | Components disclosed; weights not | Sleep duration target only | Add strain → sleep-need term and sleep debt accumulator with decay |
| **Sleep Performance** | Hours-vs-need, consistency, efficiency, restorative-stage ratio, sleep stress | Component list disclosed; formula proprietary | None | Build composite |
| **Sleep Consistency** | Bed/wake times over rolling 4-day window | 0–100% scale, computed against last 4 nights | None | Implement |
| **Stress Monitor** (0–3) | Real-time HR + HRV vs 14-day baseline, motion-gated | Scale, baseline window, motion compensation disclosed; exact thresholds proprietary | None | Implement; WHOOP labs validation against BP correlations |
| **Heart Screener (ECG)** | 1-lead ECG via thumb on clasp electrodes | XGBoost on beat-to-beat intervals (WARN); FDA-cleared on MG; 30-min epochs; ~83%/96% sens/spec target | None | Hardware-bound; out of scope unless our strap exposes electrodes |
| **Irregular Heart Rhythm Notifications (IHRN)** | Continuous PPG → beat-to-beat irregularity scan during sleep | XGBoost on overlapping 30-min PPG windows | None | Implement PPG-AF screener (Lubitz/Apple Heart Study analog) |
| **Health Monitor (5 vitals)** | RHR, HRV, RR, SpO2, skin temp | Each shown vs personalized rolling baseline (~90 nights for skin temp) | Some metrics computed | Build a single "5 vitals" view with per-metric baseline-deviation logic |
| **Menstrual Cycle Insights** | RHR, HRV, RR, skin temp, recovery, manual period log, BC status | Phase-based coaching; Cardiovascular Amplitude metric (RHR/HRV swing across cycle); ML adapts to irregular cycles | None | Implement phase classifier + amplitude analytic |
| **Pregnancy Coaching** | RHR, HRV trends + due date | Weekly insights vs cohort means; HRV inflection 7 weeks pre-labor noted (1,200-pregnancy study) | None | Implement; cohort baseline study needed |
| **VO2 Max** | 3-tier: passive (RHR + activity + sleep + demographics, ML), GPS-augmented (pace+HR), lab-anchored | n=248 graded treadmill validation; passive MAE 3.7 mL/kg/min, GPS MAE 3.3 | Firstbeat-style estimate | Adopt 3-tier model; ours is single-tier |
| **Strength Trainer / Muscular Load** | Accel + gyro (IMU) for rep detect; sets+reps+weight optionally logged; volume × intensity model | Volume = effective mass × movement; intensity = velocity/proximity-to-failure; trained on "millions" of sessions | None | Implement IMU rep counter + load model |
| **WHOOP Coach** | All member data + history + behaviors + community averages → GPT-4 with anonymization | OpenAI GPT-4 backend with proprietary RAG over user data | None | Use Claude/Sonnet with similar RAG over our data store |
| **Daily Outlook** | Today's recovery + strain target + sleep + journal-derived modifiers | LLM-generated narrative with predictive guidance | None | Build LLM-driven daily summary |
| **Journal correlations** | 5+ "yes" + 5+ "no" entries per behavior over 90 days | Correlation analysis on recovery and sleep deltas; monthly report on the 1st | None | Implement correlation engine |
| **Strain Coach / Strain Target** | Today's recovery → suggested strain band | Optimal strain band centered around recovery-derived target (e.g. 8.3–16.3 at 70% recovery) | None | Implement |
| **Auto-detected workouts** | HR-zone time + IMU cadence; >15 min and strain >8 to fire | ML classifier; learns from "millions" of logged workouts | Heuristic | Improve classifier; expand activity taxonomy |
| **Recovery activities** (cold plunge, sauna, meditation, yoga nidra, massage…) | Manual-start or post-hoc; HR + skin-temp + IMU signature | Logged; not auto-classified for most | None | Auto-classify via HR + temp signatures |
| **Performance Assessment** (WPA + MPA) | 5+ days of recovery in window | Weekly + monthly templates; community comparison cohort | None | Implement |
| **Healthspan / WHOOP Age / Pace of Aging** | 9 inputs across sleep, activity, fitness | Hazard-ratio → effective-age conversion via Gompertz; SEM correction; weekly Pace, ~6-month-anchored Age | None | Build (this doc's flagship gap) |
| **HRV-CV** | 7-day HRV stdev / mean | New formal definition; published 2025 in Am J Physiol-Heart Circ Physiol | None | Trivial to add |
| **Blood Pressure Insights** | PPG waveform + HR + recovery + demographics during sleep, calibrated by 3 cuff readings | Trained on "thousands" of users/sleep sessions; FDA warning July 2025 (regulated medical device) | None | Avoid until regulatory clarity; can prototype on PPG-PTT analog |
| **Advanced Labs** | 65 biomarkers (Quest partner) joined to WHOOP biometrics | Clinician-reviewed report; integrates with daily coaching | None | Out of scope unless we partner with a lab |

The remainder of this document expands each row.

---

## 1. WHOOP Healthspan, WHOOP Age, and Pace of Aging

WHOOP's flagship 2025 longevity feature. The user explicitly called it out as our biggest gap. WHOOP launched it bundled with WHOOP 5.0 / WHOOP MG on **May 8, 2025**, alongside the new tier names (One / Peak / Life). Note: Healthspan only ships on Peak and Life — WHOOP One members do not see it. ([WHOOP press release](https://www.whoop.com/us/en/press-center/whoop-unveils-5.0-MG/), [WHOOP membership comparison](https://www.whoop.com/us/en/membership/))

Earlier reports placed it in September 2024; that was a pre-announcement / podcast tease. The shipped product launched in May 2025 with the 5.0 generation.

### 1.1 What the user sees

Two top-line numbers:

- **WHOOP Age** — physiological age in years. Updates slowly (anchored on roughly the last six months of behavior). Equals chronological age when the user adheres to "all" public-health guidelines on the 9 input behaviors. ([Healthspan support article](https://support.whoop.com/s/article/Healthspan-WHOOP-Age-Pace-of-Aging-Guide?language=en_US))
- **Pace of Aging** — ratio in the range −1× to +3×, updated weekly. −1× means biologically younger by one year per chronological year; +1× means tracking exactly with chronology; +2× and above means accelerating decline. ([WHOOP Locker article](https://www.whoop.com/us/en/thelocker/healthspan/))

Members must have at least **21 recoveries in 31 days** to unlock Healthspan, and the feature is gated to age 18+. ([Support guide](https://support.whoop.com/s/article/Healthspan-WHOOP-Age-Pace-of-Aging-Guide?language=en_US))

### 1.2 The 9 input behaviors

WHOOP's 9 "Healthspan factors," grouped into Sleep, Strain, and Fitness:

**Sleep (2)**
1. Sleep consistency (rolling 4-day std-dev of bed/wake times)
2. Total sleep duration (hours per night)

**Strain / Activity (4)**
3. Daily steps
4. Time in heart rate zones 1–3 (lower-intensity cardio)
5. Time in heart rate zones 4–5 (higher-intensity cardio)
6. Strength-training time (minutes/week dedicated to muscular-load activity)

**Fitness (3)**
7. VO2 Max
8. Resting Heart Rate
9. Lean Body Mass (entered manually by member or estimated)

Source list: [WHOOP Locker Healthspan article](https://www.whoop.com/us/en/thelocker/healthspan/), [Podcast 323 with Emily Capodilupo](https://www.whoop.com/us/en/thelocker/podcast-323-the-9-metrics-that-make-up-your-healthspan-with-emily-capodilupo/), and [WHOOP's 2025 Healthspan white paper](https://assets.ctfassets.net/rbzqg6pelgqa/3ONehqJslbqxI7CQlwGjfT/36429d6f66940e1fd866a772ed5bfc93/WHOOP_2025_White_Paper_Healthspan__6_.pdf).

### 1.3 WHOOP Age methodology — hazard ratios → effective age

WHOOP describes the methodology as anchoring **effective age** on **all-cause-mortality hazard ratios** drawn from the epidemiological literature. The pipeline:

1. **Find the hazard ratio**: For each input behavior, WHOOP finds the published hazard ratio (HR) for all-cause mortality associated with deviation from the public-health-guideline-recommended level. Example sources (cited via the white paper and the gadgetsandwearables explainer):
   - Sleep consistency above 70% → 20–48% reduction in mortality risk ([Locker explainer](https://gadgetsandwearables.com/2025/08/07/science-behind-whoop-health-span/))
   - Regular strength training → up to ~30% reduction in all-cause mortality
   - Higher VO2 Max → very large dose-response benefits (Mandsager et al., JAMA Network Open 2018)
   - Daily steps ~8,000 → meaningful mortality reduction (Saint-Maurice et al., JAMA 2020; Lee et al., JAMA Internal Medicine 2019)

2. **Convert HR to years via Gompertz**: WHOOP uses the Gompertz law of mortality — that all-cause mortality risk roughly doubles every 8–10 years of adult age, i.e. ~10% per year. Therefore a hazard ratio HR maps to additional effective years ≈ ln(HR) / ln(1.10), or in WHOOP's plain-English approximation, "a 10% increase in mortality risk corresponds to roughly one year of effective age." Example: HR=1.22 → ~+2 years; HR=0.85 → ~−1.5 years. ([Doherty review](https://medium.com/@cailbhe/is-whoop-really-able-to-measure-your-healthspan-728b88e69175); [gadgetsandwearables explainer](https://gadgetsandwearables.com/2025/08/07/science-behind-whoop-health-span/))

3. **De-double-count via SEM**: Many of the 9 inputs are correlated — VO2 Max, RHR, time in zones 4–5, and steps share a lot of variance. WHOOP applies **structural equation modeling** to decompose direct vs indirect effects so each behavior contributes a non-overlapping share. The white paper claims this is fit on the WHOOP member panel (not a published gold-standard cohort). ([Healthspan white paper](https://www.whoop.com/us/en/thelocker/Healthspan-Data-Meets-Longevity/))

4. **Sum and add to chronological age**: Net effect summed and added to the member's chronological age. The reference comparison is **a health-optimized peer** (someone meeting all guidelines), not the average member, which is a defensible choice — comparing to "average" would normalize bad health behaviors.

### 1.4 Pace of Aging methodology

Pace of Aging is the **rate of change** of WHOOP Age — essentially d(WHOOP Age)/d(chronological time) computed as a moving 30-day comparison versus the prior baseline. Range: −1× (you're getting biologically younger) to +3× (rapidly accelerating). It updates **weekly** so users can see the consequence of behavior changes within ~1–2 weeks; WHOOP Age itself smooths over ~6 months so it doesn't yo-yo. ([Support article](https://support.whoop.com/s/article/Healthspan-WHOOP-Age-Pace-of-Aging-Guide?language=en_US))

### 1.5 Validation and caveats

WHOOP has not (as of May 2026) published a peer-reviewed validation of WHOOP Age against a gold-standard biological-age clock (e.g., GrimAge, PhenoAge, DunedinPACE). The published validation is internal and consists of:
- Cross-sectional correlation with self-reported "perceived health status" and presence of chronic conditions ([Healthspan white paper](https://www.whoop.com/us/en/thelocker/Healthspan-Data-Meets-Longevity/))
- Anchoring against the cited epidemiological hazard ratios

**Independent critiques** (Doherty, PhD, in [Medium review](https://medium.com/@cailbhe/is-whoop-really-able-to-measure-your-healthspan-728b88e69175)):
- The 10%-per-year Gompertz slope is not constant across age, sex, or population.
- Even with SEM, the model is fundamentally additive and can't capture interactions (e.g., sleep × strain).
- Confidence intervals are not surfaced in the UI — "your WHOOP Age is 31" looks deterministic when in fact it's a maximum-likelihood point estimate with wide uncertainty.
- WHOOP's calibration cohort is "healthier and more affluent than average," limiting external validity.

### Eric Topol / Stanford / collaborator note

The user asked specifically about **Eric Topol / Stanford Topol Lab**. I could not find a published WHOOP × Topol Lab collaboration. Topol writes broadly about wearables and biological-age clocks ([Scientific American 2024 commentary](https://www.scientificamerican.com/article/what-new-biological-age-clocks-say-about-longevity-according-to-eric-topol/)) and at one point quoted WHOOP favorably, but Healthspan does not list Topol as an author. The Healthspan team is led by **Emily Capodilupo, SVP of Data Science** at WHOOP.

The HRV-CV companion paper (see §16) does have notable academic co-authors: Dr. Dan Plews (AUT), Dr. Paul Laursen, Dr. Marco Altini (HRV4Training), and Dr. Andy Galpin — published in *Am J Physiol-Heart Circ Physiol*, 2025 ([DOI: 10.1152/ajpheart.00738.2025](https://doi.org/10.1152/ajpheart.00738.2025)).

### 1.6 Open-source equivalents we could adopt

- **Public hazard ratios**: Use the same epidemiological literature WHOOP uses. Key citable papers:
  - Saint-Maurice et al., *JAMA* 2020 (steps and mortality)
  - Mandsager et al., *JAMA Network Open* 2018 (CRF and mortality)
  - Liu et al., *BMJ* 2022 (muscle-strengthening activity)
  - Chudasama et al., *PLoS Medicine* 2020 (composite healthy lifestyle)
  - Walmsley et al., *Br J Sports Med* 2022 (accelerometer-measured activity)
  - Scott et al. and Chaput et al. on sleep duration U-shape
- **Biological-age clocks for benchmarking**: PhenoAge (Levine 2018), GrimAge (Lu 2019), DunedinPACE (Belsky 2022 — a "pace of aging" already validated in the Dunedin cohort and conceptually identical to WHOOP's Pace).
- **SEM library**: `lavaan` (R) or `semopy` (Python) to run the path-model decomposition.
- **Implementation sketch**: estimate per-input HR-deviation → log-transform → sum with SEM-derived weights → add to chronological age. Pace = (WHOOP Age − last-week WHOOP Age) / (1 week / 1 year).

---

## 2. Day Strain (0–21)

Strain is WHOOP's headline daily exertion score. Already in our KB; below are the WHOOP-specific implementation details.

### 2.1 Scale anchoring
0–21 scale, modeled after **Borg's Rating of Perceived Exertion (RPE 6–20)** with the convention that values double, so RPE 6 → 0–9 ("Light"), 10–13 ("Moderate"), 14–17 ("High"), 18–21 ("All Out"). The 21 cap is hard. ([WHOOP Strain support article](https://support.whoop.com/s/article/WHOOP-Strain?language=en_US))

### 2.2 Logarithmic curve
WHOOP explicitly states "the higher Strain gets, the harder it becomes to build more — going 0→10 is much easier than 10→20." This is consistent with a logarithmic mapping over total weighted heart-rate-zone time, which functionally resembles **Edwards' TRIMP** with a saturation cap. ([Locker article](https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/))

### 2.3 Inputs
- **Cardiovascular load**: time-weighted sum across HR zones, with each higher zone weighted exponentially more.
- **HR zone definition**: HRR (Heart-Rate Reserve / Karvonen) method — `%HRR = (HR − RHR) / (HRmax − RHR)`. WHOOP switched to HRR in 2024. ([Personalized HR zones blog](https://www.whoop.com/us/en/thelocker/more-personalized-heart-rate-zones-with-whoop/))
- **HRmax**: starts from **Gellish nonlinear** `HRmax = 192 − 0.007 × age²` ([Gellish 2007, Med Sci Sports Exerc](https://pubmed.ncbi.nlm.nih.gov/17468581/)), then refines as it observes the user's actual maxima over time.
- **Muscular load**: from Strength Trainer or post-hoc activity linking. See §11.
- **Combination**: cardiovascular and muscular loads are fused into a single 0–21 strain. The exact weighting is proprietary; WHOOP says "calculates the cardiovascular and muscular load to give you one complete Strain score." ([Locker](https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/))

### 2.4 Activity-level vs day-level strain
Each detected activity gets its own 0–21 score; day strain is **not the sum** but rather another logarithmically-summed total computed across all elevated-HR minutes in the day (so a short hard workout in a sedentary day might be 12 activity strain but ~13 day strain).

### 2.5 Closest published analogs we can use
- **Edwards' TRIMP** ([Edwards 1993](https://en.wikipedia.org/wiki/Training_impulse)): zone-weighted minute summation. We already have this in our KB — extend it with logarithmic compression to a 0–21 range.
- **Banister TRIMP** with intensity factor — useful for endurance.
- **Lucia TRIMP** for ventilatory thresholds.
- **sRPE (Foster 2001)** — session-RPE × duration; the perceptual analog WHOOP claims to track.

---

## 3. Recovery Score (0–100%)

### 3.1 What it is
A single percentage on every morning indicating readiness to take on strain. Color bands:
- **Green 67–100%**: well recovered, can push hard
- **Yellow 34–66%**: maintain
- **Red 0–33%**: prioritize recovery

([WHOOP Recovery support article](https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/), [Plait.fit deep dive](https://www.plait.fit/whoop-recovery-explained-guide.html))

### 3.2 Inputs (in order of weight)
WHOOP states 6 inputs are used; only ~3 dominate:
1. **HRV** — RMSSD computed during the **last slow-wave-sleep (deep) episode** of the night. This is critical: WHOOP doesn't average across the whole night. ([HRV insights article](https://support.whoop.com/s/article/Heart-Rate-Variability-HRV-Insights-WHOOP-Metrics?language=en_US))
2. **RHR** — minimum HR during sleep (typically the deepest minute).
3. **Sleep performance** — yesterday's sleep score (see §4).
4. **Respiratory rate** — deviation from 30-day baseline (modifier, not core driver).
5. **SpO2** — deviation from baseline (modifier).
6. **Skin temperature** — deviation from 90-night baseline (modifier).

### 3.3 Weighting
WHOOP has not officially published the weights. Reverse-engineering and member forum posts converge on roughly:
- HRV: **~70%**
- RHR: **~20%**
- Sleep: **~10%**
- RR / SpO2 / skin temp: **modifiers** (typically add or subtract a few points only when out of normal range)

This is corroborated in [Marco Altini's analysis](https://medium.com/@altini_marco/using-the-whoop-band-for-on-demand-heart-rate-variability-hrv-analysis-78eabd265189) noting that "the algorithm's biggest input is heart rate variability, and the information provided by RHR and sleep is most of the time redundant."

### 3.4 Personalization
Each input is normalized to the member's own **30-day baseline**, not population norms. So a "green" recovery for one user might be 65 ms RMSSD; for another, 45 ms. This is a critical methodological choice — anything that compares wearable HRV to population norms (e.g., raw "your HRV is 50") is misleading.

### 3.5 Open-source equivalents
- **HRV4Training** (Altini): the most validated open analog. Uses a per-user z-score on morning RMSSD.
- **Polar's Nightly Recharge**: uses ANS status (HRV-based) and Sleep Charge, similar weighting.
- **Garmin's Body Battery**: starts from HRV at sleep, adds activity drain.

### 3.6 Validation
Several papers validate the *components* (HR, HRV) but no peer-reviewed validation of the composite Recovery score against a gold-standard "readiness" outcome exists. The 2021 PPG validation ([Miller et al., Sensors 2021](https://www.mdpi.com/1424-8220/21/10/3571)) shows trivial bias in HR (≤0.39%) and small bias in HRV (ES ≤ 0.19) vs ECG. The 2025 multi-wearable comparison ([Dial et al., Physiological Reports 2025](https://physoc.onlinelibrary.wiley.com/doi/10.14814/phy2.70527)) found CCC = 0.76 for WHOOP HRV vs ECG (vs 0.91 for Oura Gen 4).

---

## 4. Sleep Performance, Sleep Coach, Sleep Need / Sleep Debt

### 4.1 Sleep Performance Score (0–100%)
A composite of:
- **Sleep Sufficiency** — `actual sleep / sleep need`, capped at 100%
- **Sleep Consistency** — `bed/wake-time similarity` over rolling 4-day window
- **Sleep Efficiency** — `time asleep / time in bed`
- **Restorative-sleep ratio** — fraction of total sleep in Deep + REM
- **Sleep Stress** — minutes of elevated HR/low HRV ("high stress") during the sleep window

Exact weights are not published. ([Sleep article](https://www.whoop.com/us/en/thelocker/everything-to-know-about-sleep/), [Sleep accuracy article](https://www.whoop.com/us/en/thelocker/how-well-whoop-measures-sleep/))

### 4.2 Sleep Need formula
Components disclosed; multipliers proprietary:
```
SleepNeed = Baseline + StrainContribution + DebtContribution + NapContribution
```
- **Baseline**: a per-user physiological floor — derived from age, sex, and recent sleep history. Adults default 7–9 h. ([Adult sleep article](https://www.whoop.com/us/en/thelocker/how-much-sleep-do-adults-need/))
- **StrainContribution**: a positive function of yesterday's strain — every additional point of strain adds minutes to tonight's need. WHOOP doesn't publish the slope; member analyses suggest ~3–6 minutes per strain point at high intensities.
- **DebtContribution**: cumulative shortfall over recent nights (typically last 5–14), discounted with a decay (so older debt matters less). Sleep debt > ~3 h triggers strong "get more sleep" coaching.
- **NapContribution**: subtracts a fraction (~30–50%) of nap minutes from tonight's need.

The user can target **Peak (100%)**, **Perform (85%)**, or **Get By (70%)** of their nightly need. ([Sleep Planner support article](https://support.whoop.com/s/article/Sleep-Coach-with-Wake-Alarm))

### 4.3 Sleep Coach / Sleep Planner
Recommends:
- **Bedtime** and **wake time** based on the above need + the user's inferred circadian rhythm (learned from prior wake/sleep distribution).
- **Smart wake** with three modes:
  - Exact time
  - Sleep goal hit
  - "In the green" (when recovery score crosses a threshold)
- **Haptic alarm** on the strap for non-disruptive wake.

([WHOOP 4.0 Sleep Coach announcement](https://www.whoop.com/us/en/thelocker/new-whoop-4-0-feature-sleep-coach-with-haptic-alerts/))

### 4.4 Sleep stages and consistency
- **Stages**: Awake / Light / Slow-Wave (Deep) / REM, classified per 30-second epoch from PPG-derived HR + HRV + RR + accelerometry.
- **Sleep Consistency**: a 0–100% score quantifying how similar bedtime/wake-time are over the last 4 days. ([Consistency article](https://www.whoop.com/us/en/thelocker/sleep-consistency-more-to-sleep-than-sleep-need/))

### 4.5 Validation
- [Berryhill et al., JCSM 2020](https://pubmed.ncbi.nlm.nih.gov/32713257/) — WHOOP overestimated total sleep time by 8.2 ± 32.9 min vs PSG (non-significant). Stage-level moderate accuracy.
- [Miller et al., Nature Sci Reports 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC8226553/) — automatic sleep detection vs PSG: high sensitivity, moderate specificity.
- [Chinoy et al., JMIR mHealth and uHealth 2024 systematic review](https://mhealth.jmir.org/2024/1/e52192) — WHOOP "least disagreement vs PSG" for total sleep time, light, and deep; largest disagreement for REM.
- [Birrer et al., Sleep Advances 2024](https://academic.oup.com/sleepadvances/article/6/2/zpaf021/8090472) — WHOOP 4.0 REM accuracy 61.99% epoch-by-epoch (Apple Watch S8: 68.57%).

### 4.6 Open-source equivalents
- **DeepSleep / Sleep stage classifiers** from PPG: Walch et al., *J Sleep Res* 2019 (used Apple Watch HR + activity).
- **Z3Score / SOMNOlyzer-style** algorithms.
- **Sleep need formula**: closest published is from Roenneberg's chronotype literature and Walker's *Why We Sleep* — but no exact WHOOP-form analog exists. We'd build one as: baseline + linear-strain term + decaying-debt term + nap correction.

---

## 5. Stress Monitor

### 5.1 What it is
A real-time stress score from **0 to 3** (0 low, 3 peak), updating roughly every minute. ([Stress Monitor announcement](https://www.whoop.com/us/en/thelocker/introducing-stress-monitor-a-new-way-to-monitor-manage-stress/))

### 5.2 Inputs
- **Heart rate** (instantaneous via PPG)
- **HRV** (instantaneous, on a sliding window)
- **Motion** (accelerometer) — used to gate, so exercise-driven HR elevation doesn't get flagged as "stress"

Compared against the user's **rolling 14-day baseline** for HR and HRV at the same time of day / motion level.

### 5.3 Algorithm shape (inferred)
WHOOP doesn't publish the exact mapping but the closest published analog is Firstbeat's body-battery / stress algorithm and the "Kubios HRV stress index" — both compute a real-time z-score of HR + 1/HRV against personal baseline, then map to a 0–3 or 0–100 scale.

The validation rationale they cite is that **HR and HRV changes correlate with systolic and diastolic BP changes** — i.e., autonomic markers of stress. ([Press release](https://www.whoop.com/us/en/press-center/whoop-launches-new-stress-monitor-feature-first-wearable-to-measure-daily-stress-levels-and-implement-stress-reduction-interventions-in-real-time/))

### 5.4 Built-in interventions
- **Relaxation session**: cyclic sighing protocol — backed by [Balban et al., *Cell Reports Medicine* 2023](https://pubmed.ncbi.nlm.nih.gov/36630953/) (Huberman lab), which showed cyclic sighing was significantly better than mindfulness meditation for reducing respiratory rate and improving mood.
- **Alertness session**: cyclic hyperventilation.
- Both auto-save and track the delta in stress score.

### 5.5 Open-source equivalents
- **Kubios HRV (free version)** — implements the "stress index" calculation.
- **Firstbeat body battery** algorithm (closed but well-documented).
- **OSS:** any RMSSD-vs-personal-baseline z-score, motion-gated, mapped via sigmoid.

---

## 6. Heart Screener (on-demand ECG)

### 6.1 Hardware
WHOOP MG (May 2025) added two electrodes to the **clasp** (replacing the WHOOP 4.0's plain clasp). The user holds thumb and index finger on the indents to close a single-lead ECG circuit through the body. 30-second reading.

### 6.2 What it returns
- **Sinus rhythm**
- **AFib detected**
- **Low HR** / **High HR**
- **Inconclusive**

PDF report can be shared with a clinician. ([Heart Screener article](https://www.whoop.com/us/en/thelocker/heart-screener/))

### 6.3 FDA clearance
The on-demand ECG capability on WHOOP MG is **FDA-cleared** for AFib detection (510(k)). Note: the **Blood Pressure Insights** feature on the same device is *not* cleared and triggered an FDA warning letter on July 14, 2025 — see §15.

### 6.4 Validation studies
- [Saghir et al., BMJ Open 2024 (NCT05809362)](https://pubmed.ncbi.nlm.nih.gov/38830741/): the prospective WARN validation. ~500 participants enrolled at Yale (350 with AFib history, 100 controls, 2:1 enriched cohort). Reference: BioTel ePatch, reviewed by blinded electrophysiologist. AFib defined as ≥5 minutes continuous AF on ECG.
- WARN target performance: lower-bound 95% CI of sensitivity > 60% and specificity > 90%; preliminary data showed ~83% sensitivity and ~96% specificity — comparable to Apple Heart Study's PPG arm.

### 6.5 Limitations (per WHOOP's own disclosure)
- Not intended for users with known arrhythmias other than AFib
- Not for users under 22
- Region-restricted

---

## 7. Irregular Heart Rhythm Notifications (IHRN)

### 7.1 What it is
Background passive screening — while you sleep, WHOOP MG continuously analyzes PPG for AFib-suggestive patterns and pings the user if it sees enough abnormality. Distinct from Heart Screener, which is on-demand ECG.

### 7.2 Algorithm
The published form (WARN, in the Yale protocol) is an **XGBoost** classifier on **30-minute overlapping epochs** of beat-to-beat (RR-interval) data derived from PPG. Each epoch is classified AF / non-AF; consecutive AF epochs trigger a notification.

### 7.3 Closest published analog
- [Pereira et al., npj Digital Medicine 2020](https://www.nature.com/articles/s41746-020-0226-6): systematic review of PPG-AFib detection.
- [Perez et al., NEJM 2019 (Apple Heart Study)](https://www.nejm.org/doi/full/10.1056/NEJMoa1901183): 419,297 participants; PPG → ECG patch confirmation.
- [Lubitz et al., Circulation 2022 (Fitbit Heart Study)](https://pubmed.ncbi.nlm.nih.gov/35341330/): ~455k participants; similar architecture.

OSS implementations: `tsflex` + `xgboost` on RR-intervals; `neurokit2` provides the RR extraction primitives.

---

## 8. Health Monitor (5-vitals view)

### 8.1 What it is
A single pane showing 5 nightly vitals against the user's personal rolling baseline:

1. **RHR** (lowest sleep HR)
2. **HRV** (RMSSD, last deep-sleep window)
3. **Respiratory Rate** (median during sleep)
4. **SpO2** (mean during sleep, sampled ~every 20 min for 30 s)
5. **Skin Temperature** (mean nightly, vs 90-night baseline)

Each shows a green check if "in normal range," a flag if out. ([Health Monitor article](https://www.whoop.com/us/en/thelocker/health-monitor-feature/), [Support article](https://support.whoop.com/s/article/WHOOP-Health-Monitor-Report))

### 8.2 Baseline construction
WHOOP doesn't publish the exact thresholds, but stated practice is:
- **Skin temp**: rolling 90-night baseline (per [skin temp article](https://www.whoop.com/us/en/thelocker/how-whoop-tracks-skin-temperature/))
- **HRV / RHR / RR / SpO2**: rolling 30-day means with a per-user standard deviation; "out of range" appears to be ±1.5–2σ.

### 8.3 Health Monitor Report
A daily PDF/text snapshot of the 5 vitals — designed to be shared with a doctor. Available on Peak and Life tiers.

### 8.4 Why this matters for our build
This is the easiest WHOOP feature to replicate — we already compute all five primitives. The work is:
- A unified view component
- Per-metric personal-baseline tracker (online mean + std, EWMA preferred)
- Normal-range computation per user (not population)
- A "report" exporter

---

## 9. Menstrual Cycle Insights

### 9.1 What it is
Phase-aware coaching for menstruating users. The four phases tracked: **Menstruation**, **Follicular**, **Ovulation**, **Luteal**. ([Menstrual Cycle Insights article](https://www.whoop.com/us/en/thelocker/whoop-feature-menstrual-cycle-coaching/))

### 9.2 Inputs
- Manual: period start dates, birth-control status
- Automatic: RHR, HRV, RR, skin temp, recovery, sleep

### 9.3 Phase prediction
Doesn't assume fixed-length phases — uses the user's biometric trends + manual logs to learn personal phase lengths. Adapts to irregular cycles over months. Underlying method is a personalized HMM / state-space model (WHOOP doesn't disclose; the Clue partnership and ML language strongly imply this).

### 9.4 Cardiovascular Amplitude metric
WHOOP's named metric for the **magnitude of variation in RHR and HRV** across a full cycle — basically `(max − min) / mean` for each, computed over the cycle. Larger amplitudes indicate stronger hormonal physiological response, smaller amplitudes can indicate hormonal contraception effects or anovulation. ([Women's Hormonal Insights article](https://www.whoop.com/us/en/thelocker/womens-hormonal-insights/))

### 9.5 Coaching outputs
- Phase-tailored strain targets (lower in luteal, higher in follicular)
- Sleep recommendations (more in luteal due to elevated body temp)
- Symptom logging and pattern visualization
- Predicted symptoms based on prior cycles

### 9.6 Validation
[WHOOP Menstrual Cycle Insights white paper](https://www.whoop.com/us/en/thelocker/menstrual-cycle-insights-white-paper/) — internal data showing alignment with established physiology (RHR ↑ luteal, HRV ↓ luteal, skin temp ↑ luteal). No external peer-reviewed validation as of May 2026, though WHOOP has partnered with [Clue](https://www.whoop.com/us/en/whoop-x-clue/) for cross-validation.

### 9.7 Closest peer-reviewed analogs
- [Shilaih et al., Nature Sci Reports 2017](https://www.nature.com/articles/s41598-017-01433-9): wrist-skin-temp ovulation detection.
- [Goodale et al., Nature Sci Reports 2019 (Oura)](https://www.nature.com/articles/s41598-019-43314-3): ring-based cycle phase detection.
- [Symul et al., npj Digital Medicine 2019](https://www.nature.com/articles/s41746-019-0152-7): Bayesian cycle modeling.

---

## 10. Pregnancy Coaching

### 10.1 What it is
A togglable mode that, after the user enters a projected due date, delivers weekly insights about expected physiological changes by trimester and tailored recommendations.

### 10.2 Underlying research
WHOOP ran a March 2022 **Reproductive Health Study** with **1,200 pregnancies** — the largest of its kind on a wearable cohort. ([WHOOP press release](https://www.whoop.com/us/en/press-center/whoop-identifies-novel-pregnancy-digital-biomarker-to-screen-for-premature-birth/))

Key claim: **HRV trends shift detectably ~7 weeks before labor onset**, distinguishing pre-term from term pregnancies. WHOOP markets this as a "novel digital biomarker" but it has not yet appeared in a peer-reviewed paper as of May 2026. Closest published analog is [Yeo et al., 2024](https://pubmed.ncbi.nlm.nih.gov/38632440/) on HRV as a prematurity biomarker.

### 10.3 Outputs
- Weekly trimester-aware insight (e.g., "RHR is naturally up ~10 bpm by week 20 — don't be alarmed")
- Personalized hydration / rest / activity guidance
- Trimester-specific RHR and HRV trend lines

### 10.4 Open-source equivalents
None directly. We'd need cohort means by gestational week + the user's personal baseline, which we could derive from the published Aviram, Sletten, and other pregnancy-HRV literature.

---

## 11. Strength Trainer / Muscular Load

### 11.1 What it is
A module that quantifies muscular strain from resistance training and folds it into Day Strain. Launched 2023; substantially upgraded in 2024 and 2025 ([WHOOP press](https://www.whoop.com/us/en/thelocker/whoop-introduces-strength-trainer-becomes-first-wearable-to-measure-muscular/)).

### 11.2 How reps are detected
- **IMU only**: WHOOP's accelerometer + gyroscope at 26 Hz (5.0 hardware rate). The strap detects rhythmic movement patterns characteristic of reps.
- WHOOP says this is trained on "millions of Strength Trainer sessions" — a deep-learning rep counter, almost certainly a 1D-CNN or LSTM on IMU windows.

### 11.3 Volume × Intensity model
- **Volume** = `effective_mass × distance/work × reps`
  - "Effective mass" approximates the body mass involved in the movement (squat ≈ near body weight; bicep curl ≈ much less).
  - WHOOP infers this from movement type + user weight.
- **Intensity** = a function of:
  - Velocity (rep speed → proximity to failure; slower late-set reps = higher intensity)
  - Estimated %1RM via velocity-based training (VBT) literature

### 11.4 The result is a "Muscular Strain"
Combined with cardio strain into one final 0–21 day strain. Weighting not published.

### 11.5 Closest peer-reviewed analogs
- **Velocity-based training**: Mann et al., Banyard et al. literature on bar-velocity → %1RM mapping.
- **IMU-based rep counting**: [Crema et al., IEEE 2019](https://ieeexplore.ieee.org/document/8856947); [O'Reilly et al., 2017](https://pubmed.ncbi.nlm.nih.gov/28934115/) on IMU-based strength exercise classification.
- **Open source**: `tsai` (PyTorch) for time-series classification; can train on Recofit-style datasets.

---

## 12. WHOOP Coach (LLM-based assistant)

### 12.1 What it is
An in-app conversational AI assistant. Launched September 2023 — WHOOP was the first major wearable to ship a GPT-4 powered coach. ([Locker introduction](https://www.whoop.com/us/en/thelocker/introducing-whoop-coach-powered-by-openai/), [OpenAI case study](https://openai.com/index/whoop/))

### 12.2 Architecture (per WHOOP's blog and OpenAI case study)
1. User asks a question in the app.
2. Question routed to WHOOP servers; a router model decides which sub-model handles it (general / data / coaching).
3. **PII anonymization**: personal info replaced with random identifiers before sending to OpenAI.
4. Custom RAG over the user's WHOOP data + WHOOP community averages + curated performance science.
5. GPT-4 fine-tuned on anonymized member data for conversational style.
6. Response back in <3 seconds.

### 12.3 Why this matters
Privacy-preserving RAG over wearable timeseries is a non-trivial systems problem. The stack is:
- A vector DB of curated science / FAQs
- Realtime joins to the user's recent biometrics
- A pre-prompt template injecting today's recovery, strain, sleep, and journal
- An anonymization layer

### 12.4 Open-source equivalents
- LangChain / LlamaIndex with Anthropic Claude or OpenAI GPT as LLM
- pgvector or Weaviate for science DB
- Custom data-loader joining timeseries → prompt

---

## 13. Daily Outlook

### 13.1 What it is
A morning briefing in plain English: "you slept poorly last night and your sleep debt is now 1h 47m; aim for an early bedtime and keep strain under 12 today." Powered by the same AI infrastructure as WHOOP Coach. ([Daily Outlook article](https://gadgetsandwearables.com/2025/01/24/whoop-daily-outlook/))

### 13.2 Inputs
- Today's recovery, strain target, sleep score
- Recent journal-derived correlations
- User-provided context (training plan, travel, illness, pregnancy phase, etc.)
- "Memory": WHOOP retains long-term context like frequent travel, ongoing health concerns.

### 13.3 Output format
- 1–2 sentence summary
- Suggested actions
- Optional "commit" buttons to log intent (which becomes a journal entry)

---

## 14. Journal & behavior correlations

### 14.1 What it is
A daily checkbox-style log of behaviors (alcohol, caffeine timing, magnesium, hot tub, screen time, late meal, work travel, etc.). 140+ trackable behaviors as of 2025. ([Journal article](https://www.whoop.com/us/en/thelocker/the-whoop-journal/))

### 14.2 Statistical analysis
- **Threshold to unlock**: 5 "yes" + 5 "no" responses for a given behavior in a 90-day window.
- **Output**: Monthly Performance Assessment (MPA), delivered on the 1st of each month, with per-behavior impact on Recovery, sleep duration, sleep efficiency, etc.
- **Method**: WHOOP says "advanced algorithms" — almost certainly a between-subjects mean comparison (yes-days mean Recovery vs no-days mean Recovery) with a correction for within-subject autocorrelation. Likely a paired t-test or Mann-Whitney U with Bonferroni correction across behaviors.

### 14.3 What WHOOP explicitly says
> "The suggestions and recommendations you get reflect correlations, and there's a difference between correlation and causation."

This caveat is important. The system can't randomize.

### 14.4 Open-source equivalents
- **Quantified Self / Mood Tracker** approach
- A `pandas` + `scipy.stats` per-behavior comparison is sufficient
- For richer analysis: **bayesian mixed-effects model** with user-level random effects (lme4 in R, brms, or PyMC)

---

## 15. Strain Coach / Strain Target

### 15.1 What it is
A daily-recommended strain band based on this morning's recovery — green range you should hit, yellow above (overreaching), gray below (restorative).

### 15.2 Mapping
WHOOP publishes one example anchor: at 70% recovery, the optimal band is **8.3–16.3** (centered ~12.3). The mapping is monotonic: lower recovery → lower band; higher recovery → higher band. ([Strain Coach article](https://www.whoop.com/us/en/thelocker/strain-coach/))

Approximation we can use:
```
target_strain ≈ 6 + 0.12 × recovery_pct
optimal_lower ≈ target_strain − 4
optimal_upper ≈ target_strain + 4
```
(Tuned to hit WHOOP's published anchor; verify with member data.)

### 15.3 Goal modes
- **Maintain** — stay in optimal band
- **Build** — push into overreaching periodically
- **Restore** — stay below optimal

---

## 16. HRV-CV (HRV Coefficient of Variation)

### 16.1 What it is
A new "stability" metric launched late 2025 / early 2026. Measures **how consistent your daily HRV is** over a rolling window. Lower = better.

### 16.2 Formula
```
HRV-CV = std(HRV over 7 days) / mean(HRV over 7 days)  × 100%
```
Default window: 7 days. ([HRV-CV article](https://www.whoop.com/us/en/thelocker/hrv-cv-recovery-metric/))

### 16.3 Benchmarks (from WHOOP's data)
- Elite athletes: <10%
- Healthy active adults: 10–15%
- Average member: 15–25%
- Inconsistent lifestyles / high stress: 35–40%

Naturally rises with age and BMI.

### 16.4 Validation
[Plews, Laursen, Altini, Galpin et al., Am J Physiol-Heart Circ Physiol 2025](https://doi.org/10.1152/ajpheart.00738.2025) — published in a respectable journal. Particularly sensitive to alcohol use, sleep duration, and sleep consistency.

### 16.5 Easy to ship
This is a near-zero-effort metric for us — `np.std(hrv_7d) / np.mean(hrv_7d)`. We should add it.

---

## 17. Auto-detected workouts

### 17.1 Trigger conditions
- HR-zone time elevated for **≥15 minutes**
- Activity strain reaches **≥8.0**
- IMU shows movement consistent with a workout (rhythmic motion or continuous elevated motion)

### 17.2 Classification
Once detected, WHOOP classifies into one of ~140 activity types (Running, Cycling, Weight Training, Swimming, Yoga, etc.) using a CNN/LSTM trained on "millions" of logged sessions. ([Auto-detection support](https://support.whoop.com/s/article/Automatic-and-Manual-Activity-Detection?language=en_US), [Medium article](https://medium.com/@whoop/activity-auto-detection-your-whoop-knows-when-you-work-out-a3ef227230d))

### 17.3 Limitations
- Can't capture brief (<15 min) workouts
- Won't get GPS without manual start
- Subjective — what counts as "a workout" varies; WHOOP's labels are calibrated to what most users would log

### 17.4 Open-source analogs
- **HARTH dataset** — open IMU-based activity recognition
- **MotionSense** dataset
- Standard architectures: 1D-CNN, BiLSTM, transformer-on-IMU-windows
- See our existing HAR research in the KB

---

## 18. Recovery Activities

### 18.1 Categories
WHOOP supports logging: meditation, stretching, yoga nidra, breathwork, massage, sauna, ice bath, contrast therapy, cold shower, cryotherapy, infrared sauna, foam rolling, percussive massage. ([Recovery activities article](https://www.whoop.com/us/en/thelocker/the-best-recovery-activities-according-to-whoop-members/))

### 18.2 How they're detected
Mostly **manual log** ("Start Activity" or "Add Activity" after the fact). Auto-detection is limited because:
- Sauna/cold plunge produce a distinctive skin-temp signature but WHOOP currently doesn't auto-classify these.
- Meditation looks like sitting still with elevated HRV — also not auto-detected.

### 18.3 Reported effects (from WHOOP member data)
- **Meditation** — strongest positive effect on recovery
- **Massage** — second strongest
- **Stretching, breathwork, ice baths** — modest positive

### 18.4 Opportunity for us
**Auto-classifying recovery activities is a real edge** we could ship. A sauna session has a clear signature: skin temp ↑↑, HR ↑ but motion = 0 for 15+ min. A cold plunge has skin temp ↓↓, HR spike then drop. Meditation: motion = 0, HRV ↑↑. Worth a small classifier.

---

## 19. Performance Assessment (Weekly + Monthly)

### 19.1 Weekly Performance Assessment (WPA)
Delivered every Monday to members with ≥5 days of data in the prior week. Contents:
- Strain balance breakdown vs WHOOP zones (Restoring / Optimal / Overreaching)
- Sleep performance vs prior 3-week average
- Activity-by-activity strain summary
- Community comparison (one new metric each week vs demographic peers)
([WPA article](https://www.whoop.com/us/en/thelocker/new-weekly-performance-assessment))

### 19.2 Monthly Performance Assessment (MPA)
Delivered on the 1st of each month to members with ≥14 recoveries that month. Contents:
- Month-over-month deltas
- Cardiovascular load by sport/zone
- Strain ↔ recovery balance
- Behavior correlations (the journal's payoff — see §14)

### 19.3 Implementation notes
The WPA/MPA cadence and contents are easy to replicate; the value is the journal-correlation engine + the "community" comparison cohort.

---

## 20. Heart Rate accuracy (PPG)

### 20.1 Sensor architecture
- **WHOOP 4.0**: 5 LEDs + 4 photodiodes, sampled at 100 Hz (per WHOOP marketing).
- **WHOOP 5.0 / MG**: smaller package, 26x/sec sensor sampling rate cited in marketing — likely an aggregate/effective rate; underlying PPG is still high-frequency.
- Green for HR/HRV, red + IR for SpO2.

### 20.2 Validated accuracy
- [Miller et al., Sensors 2021](https://www.mdpi.com/1424-8220/21/10/3571): WHOOP 2.0 vs ECG — bias ≤0.39%, LOA ≤1.56% for HR; trivial bias for HRV (RMSSD).
- [Bellenger et al., 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC9505647/): WHOOP HRV typical day-to-day variability in athletes — 2.7%.
- [Dial et al., Physiological Reports 2025](https://physoc.onlinelibrary.wiley.com/doi/10.14814/phy2.70527): n=13, 536 nights — WHOOP 4.0 RHR CCC = 0.91 (moderate vs Oura's high), HRV CCC = 0.76 (Oura Gen 4: 0.91).
- [Boudreaux et al., 2018](https://pubmed.ncbi.nlm.nih.gov/29933353/): WHOOP shows reasonable HRV tracking during exercise but worse than chest strap.

### 20.3 Open-source equivalents
- `heartpy` — Python PPG analysis
- `neurokit2` — HRV pipelines
- `pyhrv` — RR-interval HRV

---

## 21. Blood Pressure Insights (Life tier only)

### 21.1 What it is
Daily morning systolic/diastolic estimates (presented as **ranges**, not single values). Released May 2025 with WHOOP MG. ([BPI article](https://www.whoop.com/us/en/thelocker/blood-pressure-insights/))

### 21.2 Inputs
- PPG pulse waveform throughout sleep (pulse transit features inferred from waveform shape)
- HR, recovery metrics
- Demographics (age, sex, weight)
- **Calibration**: user must enter 3 cuff readings to anchor

### 21.3 Training claims
"Trained and validated on thousands of users and sleep sessions" (WHOOP). Some reporting cites 11,000 users / 32,000 sleep sessions but I could not verify that exact number from primary WHOOP material.

### 21.4 Regulatory status
**FDA warning letter, July 14, 2025** ([FDA letter analysis](https://insider.thefdagroup.com/p/fda-warning-letter-breakdown-whoop), [PMC analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC12822547/)): the FDA asserted BPI is a regulated medical device function being marketed without authorization. WHOOP responded that BPI is a wellness feature, not a diagnostic. WHOOP has not pulled the feature.

### 21.5 Why this matters for us
**Don't ship cuffless BP estimation** without FDA pre-submission, even as "wellness." The closest cleared analog is [Aktiia's Hilo](https://hilo.com), 510(k)-cleared mid-2025. A wellness "PPG-PTT trend" view is borderline acceptable; converting to mmHg without explicit calibration and validation is the line FDA has drawn.

### 21.6 Closest peer-reviewed analog
- [Mukkamala et al., IEEE Trans Biomed Eng 2015](https://ieeexplore.ieee.org/document/7110745): pulse-transit-time BP estimation review.
- [Ding et al., 2017](https://pubmed.ncbi.nlm.nih.gov/28113974/): cuffless BP via PPG morphology.

---

## 22. Advanced Labs (biomarker integration)

### 22.1 What it is
Launched Sept 30, 2025. Members can buy a Quest Diagnostics blood panel testing **65 biomarkers** through the WHOOP app, which reports back inside the app, joined to 24/7 wearable data. Clinician-reviewed reports. ([Advanced Labs article](https://www.whoop.com/us/en/advanced-labs/), [Quest press](https://newsroom.questdiagnostics.com/2025-09-30-WHOOP-Launches-Clinician-Reviewed-Advanced-Labs,-Unlocking-a-Comprehensive-View-of-Human-Health))

### 22.2 Categories of biomarkers (8)
Metabolism, hormones, fitness, nutrient status, inflammation, cardiovascular health, sleep, cognition.

### 22.3 Pricing
- 1 test/year: $199
- 2 tests/year: $349
- 4 tests/year: $599

### 22.4 Implication
This is a **lab partnership**, not a model. To replicate we'd need a Quest/Labcorp partnership or a marketplace integration like Function Health.

---

## 23. Membership tiers (May 2026)

| Tier | $/year | Hardware | Healthspan | Stress Monitor | ECG/IHRN | BPI | Advanced Labs |
|---|---|---|---|---|---|---|---|
| **One** | $199 | 5.0 | — | — | — | — | optional |
| **Peak** | $239 | 5.0 | ✓ | ✓ | — | — | optional |
| **Life** | $359 | MG | ✓ | ✓ | ✓ | ✓ | optional |

([Membership comparison](https://www.whoop.com/us/en/membership/))

---

## 24. Other features briefly worth noting

### 24.1 WHOOP Teams
Group / coach view for sharing recoveries across a team. Used by college and pro teams (NFL, MLB, NCAA). Includes anonymized team aggregate, individual permissioned views.

### 24.2 WHOOP Unite
B2B / employer / clinical research version. Used in [University of Arizona Sensor Lab studies](https://sensorlab.arizona.edu/sites/default/files/2023-05/WHOOP%20Unite%20Research%20FAQs_0.pdf) and similar contexts.

### 24.3 Live Heart Rate broadcast (Cycling/Apple Watch parity)
The strap broadcasts BLE HR profile so it can be used as a heart-rate sensor by third-party fitness apps (Zwift, Peloton).

### 24.4 Heart Rate Zones — Personalized
2024 update switched from %HRmax to **HRR (Karvonen)** zones, accounting for resting HR. This is an important methodological choice. ([Personalized HR zones article](https://www.whoop.com/us/en/thelocker/more-personalized-heart-rate-zones-with-whoop/))

### 24.5 Sleep Stress
A within-night metric counting time spent in elevated HR / depressed HRV during sleep. Feeds Sleep Performance.

### 24.6 Behaviors with notable correlation strength (per WHOOP's aggregate data)
- Alcohol — biggest negative driver of HRV
- Late-night eating — depresses recovery
- Hot tub before bed — improves recovery (~5%)
- Magnesium supplementation — small positive
- Caffeine after 3pm — depresses sleep efficiency

These are correlational, drawn from multi-million-day journal aggregates. Useful as priors when we ship our journal.

---

## 25. Gap analysis vs our stack

What we have already:
- Sleep staging primitives, HAR, HRV, PPG, RR-from-PPG, SpO2, sleep apnea, skin temp, strain/TRIMP, recovery scoring, longevity indices

What we should add — in rough priority order:

**Tier 1 — high user value, low engineering cost:**
1. **HRV-CV** — trivial; ~50 lines of code
2. **Health Monitor 5-vitals view** — UI layer over what we already compute
3. **Sleep Consistency** — 4-day rolling bed/wake stdev
4. **Strain Coach band** — recovery → optimal-strain band
5. **Recovery activities logging + auto-detection** (sauna, cold plunge, meditation) — distinguishing signal we'd have over WHOOP

**Tier 2 — meaningful product features, moderate cost:**
6. **Sleep Need formula** (with strain term + decaying debt)
7. **Auto-detected workouts** — IMU + HR classifier
8. **Stress Monitor** (real-time HR+HRV vs personal baseline)
9. **Performance Assessment** (weekly + monthly, with journal correlations)
10. **Daily Outlook** — LLM-driven morning briefing

**Tier 3 — flagship gap (the user's headline ask):**
11. **WHOOP Healthspan / WHOOP Age / Pace of Aging**
    - Use the same 9 inputs (or our chosen subset)
    - Apply hazard ratios from peer-reviewed literature (Saint-Maurice steps, Mandsager VO2, Liu strength, Chudasama composite)
    - Convert via Gompertz: `years = ln(HR) / ln(1.10)`
    - Apply SEM correction (we can use `semopy`) to de-double-count
    - Pace = weekly delta of WHOOP Age
    - This is multi-week work but is the headline differentiator

**Tier 4 — domain-specific:**
12. **Menstrual Cycle Insights** (with Cardiovascular Amplitude metric)
13. **Pregnancy Coaching** (cohort-based week-over-week trend lines)
14. **Strength Trainer / Muscular Load** (IMU rep counter + V×I model)
15. **WHOOP Coach LLM** (RAG over user data)

**Tier 5 — hardware / regulatory blockers:**
16. **Heart Screener (ECG)** — only if our strap exposes electrodes
17. **IHRN (PPG-AF screening)** — possible without ECG, but requires careful regulatory positioning
18. **Blood Pressure Insights** — wait for regulatory clarity post-FDA letter
19. **Advanced Labs** — partnership-driven, not a model build

---

## 26. Key citations summary

### WHOOP primary sources
- [Healthspan — WHOOP Locker](https://www.whoop.com/us/en/thelocker/healthspan/)
- [Healthspan support guide](https://support.whoop.com/s/article/Healthspan-WHOOP-Age-Pace-of-Aging-Guide?language=en_US)
- [Healthspan white paper (2025)](https://assets.ctfassets.net/rbzqg6pelgqa/3ONehqJslbqxI7CQlwGjfT/36429d6f66940e1fd866a772ed5bfc93/WHOOP_2025_White_Paper_Healthspan__6_.pdf)
- [Healthspan data meets longevity blog](https://www.whoop.com/us/en/thelocker/Healthspan-Data-Meets-Longevity/)
- [Stress Monitor announcement](https://www.whoop.com/us/en/thelocker/introducing-stress-monitor-a-new-way-to-monitor-manage-stress/)
- [Stress Monitor press release](https://www.whoop.com/us/en/press-center/whoop-launches-new-stress-monitor-feature-first-wearable-to-measure-daily-stress-levels-and-implement-stress-reduction-interventions-in-real-time/)
- [Heart Screener](https://www.whoop.com/us/en/thelocker/heart-screener/)
- [Heart Screener support article](https://support.whoop.com/s/article/ECG-Data-Accuracy-Best-Practices?language=en_US)
- [VO2 Max algorithm](https://www.whoop.com/us/en/thelocker/how-accurate-is-whoop-vo2-max/)
- [VO2 Max introduction](https://www.whoop.com/us/en/thelocker/estimate-your-vo-max-with-whoop-/)
- [Strain explainer](https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/)
- [Recovery explainer](https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/)
- [Sleep Need / Sleep Coach](https://www.whoop.com/us/en/thelocker/how-much-sleep-do-i-need/)
- [Sleep tracking guide](https://www.whoop.com/us/en/thelocker/everything-to-know-about-sleep/)
- [Health Monitor feature](https://www.whoop.com/us/en/thelocker/health-monitor-feature/)
- [Skin temp tracking](https://www.whoop.com/us/en/thelocker/how-whoop-tracks-skin-temperature/)
- [SpO2 tracking](https://www.whoop.com/us/en/thelocker/metric-blood-oxygen-monitoring/)
- [Respiratory rate tracking](https://www.whoop.com/us/en/thelocker/respiratory-rate-tracking-coronavirus/)
- [HRV-CV recovery metric](https://www.whoop.com/us/en/thelocker/hrv-cv-recovery-metric/)
- [HRV Insights support](https://support.whoop.com/s/article/Heart-Rate-Variability-HRV-Insights-WHOOP-Metrics?language=en_US)
- [Personalized HR zones](https://www.whoop.com/us/en/thelocker/more-personalized-heart-rate-zones-with-whoop/)
- [Menstrual Cycle Insights](https://www.whoop.com/us/en/thelocker/whoop-feature-menstrual-cycle-coaching/)
- [Menstrual Cycle white paper](https://www.whoop.com/us/en/thelocker/menstrual-cycle-insights-white-paper/)
- [Pregnancy Coaching](https://www.whoop.com/us/en/thelocker/understanding-pregnancy-with-groundbreaking-new-research-and-pregnancy/)
- [Strength Trainer](https://www.whoop.com/us/en/thelocker/introducing-strength-trainer-a-new-way-to-quantify-the-impact-of-your-strength-training/)
- [Muscular Load explainer](https://www.whoop.com/us/en/thelocker/how-whoop-measures-muscular-load/)
- [WHOOP Coach (OpenAI)](https://www.whoop.com/us/en/thelocker/introducing-whoop-coach-powered-by-openai/)
- [WHOOP × OpenAI case study](https://openai.com/index/whoop/)
- [Daily Outlook coverage](https://gadgetsandwearables.com/2025/01/24/whoop-daily-outlook/)
- [Journal](https://www.whoop.com/us/en/thelocker/the-whoop-journal/)
- [Strain Coach](https://www.whoop.com/us/en/thelocker/strain-coach/)
- [Auto-detection](https://medium.com/@whoop/activity-auto-detection-your-whoop-knows-when-you-work-out-a3ef227230d)
- [WPA](https://www.whoop.com/us/en/thelocker/new-weekly-performance-assessment)
- [Blood Pressure Insights](https://www.whoop.com/us/en/thelocker/blood-pressure-insights/)
- [WHOOP MG launch press](https://www.whoop.com/us/en/press-center/whoop-unveils-5.0-MG/)
- [Advanced Labs](https://www.whoop.com/us/en/advanced-labs/)
- [Everything WHOOP launched in 2025](https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/)
- [Membership pricing](https://www.whoop.com/us/en/membership/)

### Peer-reviewed validation papers
- Berryhill et al., *J Clin Sleep Med* 2020 — sleep staging vs PSG. [PubMed](https://pubmed.ncbi.nlm.nih.gov/32713257/)
- Miller et al., *Nature Sci Reports* 2020 — automatic sleep detection. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8226553/)
- Miller et al., *Sensors* 2021 — PPG-derived HR/HRV vs ECG. [MDPI](https://www.mdpi.com/1424-8220/21/10/3571)
- Bellenger et al., 2022 — HRV day-to-day variability in athletes. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9505647/)
- Saghir et al., *BMJ Open* 2024 — WARN AFib study protocol. [PubMed](https://pubmed.ncbi.nlm.nih.gov/38830741/)
- Chinoy et al., *JMIR mHealth uHealth* 2024 — Fitbit/Garmin/WHOOP systematic review. [JMIR](https://mhealth.jmir.org/2024/1/e52192)
- Birrer et al., *Sleep Advances* 2024 — six wearables vs PSG. [Oxford Academic](https://academic.oup.com/sleepadvances/article/6/2/zpaf021/8090472)
- Dial et al., *Physiological Reports* 2025 — nocturnal HR/HRV across 5 wearables. [Wiley](https://physoc.onlinelibrary.wiley.com/doi/10.14814/phy2.70527)
- Plews, Laursen, Altini, Galpin et al., *Am J Physiol-Heart Circ Physiol* 2025 — HRV-CV. [DOI](https://doi.org/10.1152/ajpheart.00738.2025)
- Mandsager et al., *JAMA Network Open* 2018 — VO2 Max and mortality.
- Saint-Maurice et al., *JAMA* 2020 — steps and mortality.
- Liu et al., *BMJ* 2022 — strength training and mortality.
- Chudasama et al., *PLoS Medicine* 2020 — composite healthy lifestyle.

### Independent / regulatory sources
- [Doherty PhD critique of Healthspan](https://medium.com/@cailbhe/is-whoop-really-able-to-measure-your-healthspan-728b88e69175)
- [FDA warning letter analysis (FDA Group)](https://insider.thefdagroup.com/p/fda-warning-letter-breakdown-whoop)
- [MD+DI WHOOP/FDA analysis](https://www.mddionline.com/wearable-medical-devices/to-be-or-not-to-be-a-medical-device-fda-vs-whoop)
- [Lessons from WHOOP's FDA warning letter, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12822547/)
- [Bloomberg WHOOP 5.0 / MG review](https://www.bloomberg.com/news/features/2025-05-08/review-whoop-5-0-whoop-mg-add-ecg-blood-pressure-subscription-from-199)
- [DC Rainmaker WHOOP 4.0 review](https://www.dcrainmaker.com/2021/11/whoop-platform-review.html)
- [Wareable WHOOP Coach hands-on](https://www.wareable.com/wearable-tech/whoop-launches-gpt-4-ai-coach)
- [Gadgets and Wearables — Healthspan science](https://gadgetsandwearables.com/2025/08/07/science-behind-whoop-health-span/)

---

## 27. Honesty about what we don't know

WHOOP keeps a substantial portion of its algorithms proprietary. Specifically, the following are **not publicly disclosed in any form we could verify**:

- Exact weighting of HRV vs RHR vs sleep in Recovery (the 70/20/10 figure is reverse-engineered, not official)
- Exact strain logarithmic mapping function (we know it's logarithmic and zone-weighted; coefficients unknown)
- Exact Sleep Need formula coefficients (strain → minutes, debt decay rate, nap discount)
- Exact Sleep Performance composite weights
- The structural-equation model parameters in WHOOP Age
- The XGBoost model parameters / feature set in WARN
- The IMU rep-detection neural-net architecture
- The Stress Monitor's mapping from HR/HRV deviation to 0–3 scale
- The Strain Target → recovery mapping (we have one anchor at 70%)
- The exact threshold for "out of range" on Health Monitor (likely ±1.5–2σ, not confirmed)
- The Cardiovascular Amplitude exact computation in cycle insights

For each, the closest published analog is named in this doc. Building parity requires either:
1. Empirical fitting against our own data once we have a population, or
2. Adopting the closest peer-reviewed analog and tuning from there.

The user-facing outputs (a 0–100 recovery, a 0–21 strain, a sleep score, a WHOOP Age) are conceptually replicable from the disclosed components. The exact numerical match is unattainable; the **directional match** (green/yellow/red, optimal/overreaching/restorative) is achievable.
