# Wearables Knowledge Base

*Compiled: 2026-05-10. Scope: open-source / public-research projects relevant to a WHOOP-class wearables data platform (BLE strap → metrics → coaching).*

> Currency caveat: GitHub commit dates change after this snapshot. Star/commit counts cited reflect what was visible at search time. URLs are direct so the user can verify.

> **See also:** [`research/whoop-features-deep-dive.md`](./research/whoop-features-deep-dive.md) — every shipped WHOOP feature (Healthspan / WHOOP Age, Day Strain, Recovery, Sleep Need, Stress Monitor, Heart Screener, Pregnancy Coach, Strength Trainer, WHOOP Coach, etc.) with inputs, methodology, citations, and gaps vs our stack. Index: [`research/README.md`](./research/README.md).

---

## 1. WHOOP-specific projects

### 1.1 Reverse-engineering the strap (BLE, firmware, packets)

| Project | URL | Lang | License | Last activity (as observed) | What it covers |
|---|---|---|---|---|---|
| **bWanShiTong/openwhoop** | https://github.com/bWanShiTong/openwhoop | Rust | (repo-declared) | Active in early 2026 | Most mature open WHOOP toolkit. Full BLE client, decoded V12/V24 96-byte sensor packet, IMU parsing, sleep/exercise detection, SpO2, skin-temp, stress (Baevsky SI), strain (Edwards TRIMP), SQLite/Postgres persistence, high-frequency sync, multi-packet assembly. **This is the algorithmic gold mine.** |
| **bWanShiTong/reverse-engineering-whoop-post** | https://github.com/bWanShiTong/reverse-engineering-whoop-post | Markdown/docs | Open | Stable; reached HN front page | Definitive write-up of GATT service `61080001-…`, packet framing (SOF 0xAA, length, CRC-8 header, payload, CRC-32), 68 commands, no app-layer encryption finding. |
| **bWanShiTong/reverse-engineering-whoop** | https://github.com/bWanShiTong/reverse-engineering-whoop | Python | Open | Archived | Earlier packet-capture tools and partial decoders that fed the write-up. |
| **jogolden/whoomp** | https://github.com/jogolden/whoomp | JS + Python | Open | Stable | Web-Bluetooth UI + Python `bleak` client; decodes HR + RR + (some) headers. Couldn't crack the 96-byte sensor body — that's the gap openwhoop closed. Has basic HRV (RMSSD, SDNN, LF/HF) on the JS side. |
| **christianmeurer/whoop-reader** | https://github.com/christianmeurer/whoop-reader | (small) | DMCA §1201(f) framing | Stable | Documents the GATT service + 5 characteristics (cmd, response, events, data, diagnostics). Read-only "observer" framing for legal cover. |
| **jacc/whoop-re** | https://github.com/jacc/whoop-re | — | Open | — | Reverse-engineering of WHOOP's *production REST API* (the cloud side, not the strap). Distinct from BLE work. |
| **jjur/whoop-sleep-HR-data-api** | https://github.com/jjur/whoop-sleep-HR-data-api | Python | Open | — | Unofficial scraper for sleep + HR (6-second resolution) via the cloud API. |
| **Official WHOOP Developer Platform** | https://developer.whoop.com/ | REST | Commercial T&Cs | Active | OAuth 2.0; daily/sleep/cycle/recovery summaries only — no raw PPG, no IMU, no RR intervals. |
| **lyledean1/blescanner** | https://github.com/lyledean1/blescanner | Swift | Open | — | SwiftUI BLE scanner that was used for early inspection of the WHOOP HR characteristic. |

**Novel techniques worth lifting:**
- *openwhoop's* high-frequency sync mode (cmds 96/97) — ~90× faster historical download.
- *openwhoop's* V12/V24 packet discriminator (sequence 12 or 24, length ≥ 77 → full sensor block).
- *whoomp's* dual JS+Python client architecture (Web-Bluetooth UI for prototyping, Python for headless servers).

### 1.2 What none of them ship yet
- ML-based recovery score (everyone uses simple weighted formulas or none at all).
- Sleep stage classification (REM / Core / Deep) — only sleep/wake.
- Sleep apnea / breathing-event screening from SpO2 + accel.
- Activity *type* recognition (cycling / hiking / strength) — only sleep vs exercise vs idle.
- Longevity / biological-age indices.

---

## 2. Algorithm domains

### Domain 2.1 — Sleep detection & sleep staging

**Goal**: Detect sleep periods and (ideally) stage them into Wake / Light (N1+N2) / Deep (N3) / REM at 30-s epoch resolution.
**Inputs typically used**: 3-axis accelerometer (gravity + activity counts), wrist PPG (HR + RR intervals → HRV bands), optionally skin temperature, optionally SpO2.

**Approach A — Gravity-delta still-time heuristic (openwhoop)**
- Source: `/Users/nish/Documents/noop/resource/openwhoop/src/openwhoop-algos/`
- Method: Per consecutive gravity-vector pair compute Δ = √(Δx²+Δy²+Δz²); flag "still" if < 0.01 g; rolling 15-min window with ≥ 70 % still → "sleep"; post-process with min-duration 60 min, gap-merge 20 min, absorb activity blips < 15 min.
- Strengths: Trivial to implement; runs on-device; no labels needed.
- Weaknesses: No staging; misses lying-awake; can't handle cosleeping artefacts.
- Complexity: 1/5.

**Approach B — Random-forest / neural-net on 30-s features (Walch / Apple Watch dataset)**
- Source: https://github.com/ojwalch/sleep_classifiers (Walch et al., *SLEEP* 2019, https://academic.oup.com/sleep/article/42/12/zsz180/5549536)
- Method: Extract motion (activity counts), HR mean + local std, and a "clock proxy" (circadian phase estimate from time-of-day) per 30-s epoch; train RF / SVM / shallow NN against PSG-labelled SleepAccel dataset (31 subjects). Adding the clock proxy raises wake-recall by ~14 %.
- Strengths: Public training data + reference code; PSG-validated; small enough for on-device.
- Weaknesses: 31-subject dataset; mostly 2-class; sensitive to PPG-derived HR quality.
- Complexity: 3/5.
- Code: scikit-learn-based, MIT/BSD style.

**Approach C — SleepPPG-Net (raw-PPG end-to-end CNN)**
- Source: Kotzen et al., *IEEE Trans Biomed Eng* 2022 (https://peterhcharlton.github.io/publication/kotzen-2022/); reference impls in https://github.com/DavyWJW/sleep-staging-models and https://github.com/MADSOLSEN/SleepStagePrediction
- Method: 1-D dilated CNN consuming raw PPG (no hand-crafted features); 4-class output (W / Light / Deep / REM). Trained on ~2,374 patients / ~23k hours from MESA + CFS.
- Strengths: SOTA among open models — Cohen κ ≈ 0.75 on held-out PSG; transfers across cohorts (κ ≈ 0.74 with fine-tune).
- Weaknesses: Needs raw PPG at ≥ 25 Hz (WHOOP gives this in real-time only); training requires NSRR access.
- Complexity: 4/5 to train, 3/5 to deploy.

**Approach D — Dual-stream PPG + Accel (UbiComp 2025 / DavyWJW models)**
- Source: https://github.com/DavyWJW/sleep-staging-models — "On Improving PPG-Based Sleep Staging" (https://arxiv.org/html/2508.02689v1)
- Method: Two CNN encoders (PPG branch, accel branch) fused before the temporal head; data augmentation via PPG quality masking.
- Strengths: Reported 83.3 % accuracy / κ 0.745; outperforms PPG-only on noisy wrist data.
- Weaknesses: Heavier model; needs both streams aligned.
- Complexity: 4/5.

**Approach E — Apple Watch white-paper algorithm**
- Source: *Estimating Sleep Stages from Apple Watch* (Sept 2023, updated Oct 2025) https://www.apple.com/health/pdf/Estimating_Sleep_Stages_from_Apple_Watch_Oct_2025.pdf
- Method: Accelerometer-only sleep stager; 30-s epochs → {Awake, REM, Deep, Core}. Apple emphasises respiration-induced motion patterns extracted from accelerometer rather than PPG (likely a CNN; not disclosed).
- Strengths: Validated on diverse cohorts; runs purely on accel (low power, no PPG cost).
- Weaknesses: Closed; underestimates REM vs PSG in third-party studies.
- Complexity: not directly reproducible — research-only.

**Approach F — Oura OSSA 2.0 (proprietary)**
- Source: Validation paper Sleep Med 2024 (https://www.sciencedirect.com/science/article/pii/S1389945724000200); Oura blog https://ouraring.com/blog/developing-ouras-latest-sleep-staging-algorithm/
- Method: PPG + IR + accel + temperature, gradient-boosted + sequence model. 96-subject multi-night validation. 4-stage agreement κ ≈ 0.62; widely judged the most accurate consumer sleep tracker (BWH 2025 study).
- Use as: external benchmark.

**Approach G — YASA (gold-standard PSG, useful for label generation)**
- Source: https://github.com/raphaelvallat/yasa (BSD-3); Vallat & Walker *eLife* 2021 https://elifesciences.org/articles/70092
- Method: LightGBM ensemble on EEG/EOG/EMG features over 30-s epochs; trained on > 30 k h PSG.
- Use case for us: not for the watch directly — but as the *labeler* if we ever collect a small reference PSG set, or to validate that our HRV-derived hypnograms align with EEG-truth.

**Approach H — InsightSleepNet (interpretable, uncertainty-aware)**
- Source: Park et al., *npj Digital Medicine* 2024 https://pmc.ncbi.nlm.nih.gov/articles/PMC10865603/
- Method: Attention-based PPG sleep stager with epistemic uncertainty estimation (Monte-Carlo dropout); reports per-epoch confidence.
- Strengths: Calibration is critical for downstream coaching ("don't tell user 'deep sleep' when uncertain").
- Complexity: 4/5.

**Approach I — sleeppy / sleep-tracking RNN**
- https://github.com/elyiorgos/sleeppy — wrist-actigraphy oriented sleep-window detection (Cole-Kripke, van Hees), open source.
- https://github.com/hegdepashupati/sleep-tracking — RNN on physiological features.

**Approach J — WatchSleepNet (pretraining + smartwatch fine-tune)**
- Source: Wang et al., MLR 2025 https://raw.githubusercontent.com/mlresearch/v287/main/assets/wang25a/wang25a.pdf
- Method: Self-supervised pretraining on consumer-watch PPG, fine-tune on small PSG-labelled set. Built for the smartwatch domain shift specifically.

---

### Domain 2.2 — Activity detection (HAR + sport-specific)

**Goal**: Classify what the wearer is doing in 1-30 s windows (walk / run / cycle / hike / swim / stairs / sedentary / sleep) from accel ± gyro ± barometer ± HR.
**Inputs**: 3-axis accel @ ≥ 25 Hz (we have 52 Hz IMU); optionally gyro, barometer, HR.

**Approach A — Cadence-FFT walking/running classifier (current openwhoop / our codebase)**
- Method: Magnitude of accel → bandpass 0.5-3 Hz → FFT → dominant frequency = cadence; thresholds split walking (~1.5-2.5 Hz), running (~2.5-3.5 Hz).
- Strengths: O(N log N), no training, interpretable.
- Weaknesses: Confuses arm swing during cycling; can't detect hill / load.
- Complexity: 2/5.

**Approach B — Hand-crafted features + Random Forest / SVM (UCI HAR / WISDM canon)**
- Datasets: UCI HAR https://archive.ics.uci.edu/dataset/240/human+activity+recognition+using+smartphones (30 subjects, 6 activities, 50 Hz waist accel+gyro); WISDM (51 subjects, 18 activities).
- Reference impls: e.g. https://github.com/srvds/Human-Activity-Recognition (RF on time/freq features → ~93 %); benchmarks at https://www.ijcaonline.org/archives/volume187/number47/.
- Method: Per 1-3 s window compute mean, std, IQR, jerk, axis-correlation, FFT energy, spectral entropy → RF/SVM/XGBoost.
- Strengths: Strong baseline (UCI HAR ~96 %, WISDM ~90 %); explainable feature importances.
- Weaknesses: Requires per-device retraining; window-boundary effects.
- Complexity: 2/5.

**Approach C — CNN-LSTM / DeepConvLSTM end-to-end**
- Reference: Ordoñez & Roggen 2016 DeepConvLSTM; modern: https://github.com/SamanKhamesian/Time-Series-Classification-for-Human-Activity-Recognition; CNN-LSTM with self-attention https://pmc.ncbi.nlm.nih.gov/articles/PMC9252338/ → 98.76 % MHEALTH, 93.11 % UCI-HAR.
- Method: 1-D CNNs over raw windows → LSTM/GRU temporal head → softmax over activities.
- Strengths: SOTA on benchmarks; needs no feature engineering.
- Weaknesses: 100 k-1 M params; harder to deploy on-strap.
- Complexity: 4/5.

**Approach D — Self-supervised foundation model on UK Biobank (OxWearables)**
- Source: https://github.com/OxWearables/stepcount; SSL backbone https://github.com/OxWearables/ssl-wearables (ResNet-V2-18 pretrained on UK Biobank ~700k subject-days).
- Method: Self-supervised pretraining (multi-task: temporal arrow, permutation, scaling) on raw 30 Hz wrist accel; fine-tune on small labelled task (step count, activity type).
- Strengths: Best free pretrained backbone available; cited by Nature Sci Data; pip-installable (`stepcount`).
- Weaknesses: ResNet-18 inference cost on-strap; output requires a head per task.
- Complexity: 3/5 (use frozen encoder + linear probe).

**Approach E — Cycling cadence via crank-aligned IMU**
- Source: *Cadence Detection in Road Cycling …* https://www.mdpi.com/1424-8220/22/16/6140
- Method: ML model on saddle-tube or shoe IMU; freq-domain peak detection in cadence band (60-110 RPM). For wrist: cycling appears as low-amplitude periodic shake — typically detected as "low-magnitude high-cadence non-walking".
- Wrist-only fallback: rolling magnitude RMS low + dominant freq absent in walking band + sustained HR elevation → cycling proxy.
- Complexity: 3/5.

**Approach F — Stair detection (multi-sensor)**
- Pure-accel: https://github.com/michaeltroger/simple-stair-detection — gravity-axis projection + Fourier peak in stair-stride band, no ML.
- Accel + barometer: Wearable-Based Stair Climb (Sensors 2022, https://www.mdpi.com/1424-8220/22/17/6600) — Random Forest on combined features → ~88 % over 8 s windows (https://kristofvl.github.io/usi/pdf/ubi_iwoar24_14.pdf).
- StairPy CWT method: continuous wavelet transform on vertical accel, low-pass Butterworth, peak detection → step events.
- Sign-of-elevation from barometer disambiguates up vs down (which accel alone struggles with).
- Complexity: 2-3/5.

**Approach G — Hill / sustained ascent (barometer-derived)**
- Method (Suunto/Garmin standard): pressure → altitude via hypsometric formula `h = 44307.694·(1 − (p/p₀)^0.190284)`. Apply Kalman or moving-average filter at 1-10 Hz; cross-validate altitude jumps with accel activity to reject weather drift (BVC method, https://wfsensors.com/blog/pressure-sensors-in-smartwatch-barometric-detection-applications.html/).
- Hill detection rule: cumulative gain over rolling 5-min window > threshold AND walking/running activity → hill. Grade % = Δh / Δhorizontal_distance (needs GPS or step×length proxy).
- WHOOP 4.0 has *no barometer* — this requires adding a phone-side barometer feed or skipping.
- Complexity: 2/5 if you have the sensor.

**Approach H — Swimming detection (when HR/PPG fails underwater)**
- Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC8348079/ (Sensors 2021 framework); https://pmc.ncbi.nlm.nih.gov/articles/PMC6683631/ (3-D wrist-trajectory stroke-phase detection)
- Method: Detect "no-PPG-signal + repetitive accel pattern + sustained for > 5 min". Stroke-style classification by axis-correlation pattern (front-crawl shows asymmetric Y-axis dominance; breaststroke symmetric XY; backstroke inverted gravity baseline). DTW against templates or 1-D CNN over 30-s windows.
- Reported: 100 % swim/turn detection, 100 % style TPR on small datasets.
- Complexity: 3/5; the hardest part is detecting *that* the user is swimming, not the stroke.

**Approach I — Hiking (vs walking) heuristic**
- No widely-cited dedicated paper; community practice: hiking = walking activity sustained > 20 min + barometric gain > 50 m + variable cadence (terrain).
- Or: HR sustained 60-75 % HRR with low-frequency cadence and no GPS speed > 10 km/h.

**Approach J — One-size-fits-most walking recognition**
- Source: https://www.nature.com/articles/s41746-022-00745-z (Straczkiewicz et al., npj Digital Medicine 2022)
- Method: Frequency-domain method robust across smartphone/smartwatch/research accel; identifies walking bouts and per-stride cadence without training.
- Strengths: device-agnostic; reference open-source impl.
- Complexity: 2/5.

---

### Domain 2.3 — HRV computation

**Goal**: Convert RR-interval streams into time-, frequency-, and non-linear HRV metrics; expose a stress / autonomic-balance index.
**Inputs**: RR-intervals (ms) from PPG peaks; ideally with motion-artefact rejection.

**Approach A — Time-domain (RMSSD, SDNN, pNN50) — current openwhoop**
- Method: Rolling 300-RR window: RMSSD = √(mean(diff(RR)²)); SDNN = std(RR); pNN50 = fraction of |ΔRR| > 50 ms.
- WHOOP-style normalised score: ln(RMSSD)/6.5 × 100 (EliteHRV convention).
- Complexity: 1/5.

**Approach B — Frequency-domain (Welch on resampled RR)**
- Method: Cubic-spline RR series → resample to 4 Hz → Welch PSD → integrate VLF (0.0033-0.04 Hz), LF (0.04-0.15), HF (0.15-0.40); LF/HF ratio.
- Library: `scipy.signal.welch` + neurokit2 wrapper.
- Weakness: interpolation introduces bias; Clifford & Tarassenko 2004 (https://www.robots.ox.ac.uk/~gari/papers/CliffordTBME2004-Publish.pdf) quantify the error.
- Complexity: 2/5.

**Approach C — Lomb-Scargle PSD (no resampling)**
- Source: Clifford 2004; PhysioNet `lomb` https://archive.physionet.org/physiotools/lomb/; `astropy.timeseries.LombScargle`.
- Method: Compute periodogram directly on irregularly-spaced RR times → integrate same bands.
- Strengths: Avoids resampling artefacts; better when ectopics are *excluded* rather than imputed.
- Weaknesses: Slower; spectral leakage for short series.
- Complexity: 3/5.

**Approach D — Autoregressive PSD (Burg / Yule-Walker)**
- Method: Fit AR(p≈12-16) to evenly-resampled RR; analytical PSD from poles.
- Strengths: Smooth spectra on short windows (5-min); standard in clinical HRV.
- Complexity: 3/5.

**Approach E — Poincaré non-linear (SD1, SD2, ratio)**
- Method: Plot RR_n vs RR_{n+1}; SD1 = SD perpendicular to identity (≈ short-term/parasympathetic); SD2 along identity (long-term).
- Strengths: Interpretable visualization for users; SD1/SD2 ratio is a randomness proxy.
- Library: neurokit2 `hrv_nonlinear`.
- Complexity: 1/5 once you have RR.

**Approach F — Baevsky Stress Index (current openwhoop)**
- Method: 50-ms RR-bin histogram → mode (Mo), mode-fraction (AMo %), variation range (VR = (max-min)/1000). SI = AMo / (2·VR·Mo). Normal 80-150; mild stress 1.5-2×; severe 5-10×.
- Reference: https://journals.physiology.org/doi/full/10.1152/ajpregu.00243.2024
- Strengths: Single number, sympathetic-tone proxy; widely cited in Eastern-European medicine.
- Weaknesses: Western literature less standardised; histogram bin choice matters.
- Complexity: 2/5.

**Approach G — Real-time HRV streaming (cardio-rs, hrv-rs)**
- https://github.com/mat-kie/hrv-rs — Rust BLE-strap HRV with live RMSSD/SDRR/SD1/SD2/Poincaré.
- https://docs.rs/cardio-rs/ — `no_std`-compatible Rust crate; live-windowed RR processing.
- Pattern: ring-buffer of last N RRs, recompute on each new sample, debounced UI emit.

**Approach H — Comprehensive Python pipelines**
- **NeuroKit2** https://neuropsychology.github.io/NeuroKit/ — 124 HRV metrics; the de-facto standard. Paper https://link.springer.com/article/10.3758/s13428-020-01516-y. Pellegrini et al. 2022 published a sleep-physiology pipeline: https://pmc.ncbi.nlm.nih.gov/articles/PMC9307944/.
- **HeartPy** — PPG-noise-resistant peak detector + HRV; Arduino + Python; great for wrist-PPG specifically.
- **pyHRV** https://github.com/PGomes92/pyhrv — 78 metrics; matplotlib-friendly.
- **hrv-analysis (Aura)** https://github.com/Aura-healthcare/hrv-analysis — clean time/freq/non-linear API; production-tested.
- **RapidHRV** — open toolbox for HR + HRV extraction (https://pmc.ncbi.nlm.nih.gov/articles/PMC8957280/).

---

### Domain 2.4 — PPG processing & motion-artefact removal

**Goal**: Get clean RR intervals (and optionally raw HR, SpO2, respiration) from a noisy wrist PPG.
**Inputs**: Raw PPG (one or more wavelengths, 25-128 Hz typical).

**Approach A — Bandpass + peak-detect baseline**
- Method: Butterworth 0.5-5 Hz → derivative → adaptive threshold peak-pick → reject RR outside [300, 2000] ms.
- Library: NeuroKit2 `ppg_findpeaks`, HeartPy.
- Complexity: 1/5.

**Approach B — Wavelet denoising**
- Method: DWT (e.g. db4, 5 levels), soft-threshold detail coefficients, reconstruct.
- Reference: https://github.com/Peter2455/PPG-Signal collects multiple wavelet variants.
- Complexity: 3/5.

**Approach C — Adaptive filtering with accelerometer reference (LMS / RLS)**
- Method: Use simultaneous accel signal as the noise reference; LMS/RLS adaptive filter cancels motion-correlated PPG components.
- Reference: PREHEAT (constrained RLS + wavelets), https://github.com/mintisan/hr_estimate.
- Complexity: 3/5.

**Approach D — TROIKA framework (gold-standard for exercise PPG)**
- Source: Zhang et al. *IEEE TBME* 2014 https://ar5iv.labs.arxiv.org/html/1409.5181
- Method: SSA decomposition → temporal-difference sparsifying → sparse spectrum reconstruction → spectral peak tracking with verification. MAE 2.34 BPM during 15 km/h running.
- Strengths: SOTA for high-motion HR.
- Weaknesses: Heavy compute; was designed for HR, not RR for HRV.
- Complexity: 4/5.

**Approach E — Kalman filter on instantaneous HR / RR**
- Method: State = HR + dHR/dt; observation = peak-derived inter-beat; Q tuned for physiologic max ΔHR.
- Strengths: Handles dropouts gracefully.
- Complexity: 2/5.

**Approach F — End-to-end pipeline (E2E-PPG)**
- Source: https://github.com/HealthSciTech/E2E-PPG
- Method: Quality assessment → motion-artifact removal → HR/HRV extraction in one pipeline. Great as a reference implementation skeleton.

**Approach G — pyPPG comprehensive analysis**
- Source: https://github.com/godamartonaron/GODA_pyPPG (and Charlton's PhysioZoo)
- Method: Detects PPG fiducial points (onset, peak, dicrotic notch, max-slope) and computes 100+ digital biomarkers (PWV proxies, augmentation index, etc.).

**Approach H — Awesome-PPG meta-list (use as discovery)**
- https://github.com/mintisan/awesome-ppg — curated index of PPG datasets, libs, and papers; updates regularly.

---

### Domain 2.5 — Respiratory rate from PPG

**Goal**: Estimate breaths/min during rest and sleep.
**Inputs**: PPG (preferably ≥ 25 Hz green, raw); optional accel for chest-wall motion.

**Approach A — Three-modulation Smart Fusion (Karlen 2013)**
- Source: Karlen et al. *Multiparameter respiratory rate estimation* 2013 https://pubmed.ncbi.nlm.nih.gov/23399950/
- Method: Extract RIIV (intensity), RIAV (amplitude), RIFV (frequency) modulations via incremental-merge segmentation; FFT each; fuse via consistency check (Smart Fusion rejects when estimates disagree).
- Strengths: Reference algorithm; ~1 BPM bias.
- Complexity: 3/5.

**Approach B — Synchrosqueezing transform (SST) instantaneous RR**
- Source: https://www.frontiersin.org/articles/10.3389/fphys.2018.00948/
- Method: SST on PPG → extract RIIV/RIAV/RIFV time-frequency ridges → second SST → peak-conditioned fusion. Gives *instantaneous* RR.
- Complexity: 4/5.

**Approach C — Charlton RRest toolbox (38 algorithms benchmarked)**
- Source: https://peterhcharlton.github.io/RRest/algorithms.html (open MATLAB / Python ports)
- Method: Modular: extract feature → derive respiratory signal → peak-pick or FFT. Best reported: -5.1 to +7.2 BPM 95 % LoA.

**Approach D — WHOOP's `resp_rate_raw` field (already decoded)**
- The 96-byte V12/V24 packet contains a `resp_rate_raw` u16 at offset [73:75]. openwhoop decodes but doesn't surface it. Easiest win: scale/calibrate this value rather than compute from scratch.

**Approach E — Deep-learning (RespNet variants)**
- Recent CNN/Transformer models can hit ~1 BPM MAE on PPG-only — see https://link.springer.com/article/10.1007/s40846-022-00700-z. Heavier; probably overkill for our use.

---

### Domain 2.6 — SpO2 from PPG (red + IR)

**Goal**: Blood oxygen % from dual-wavelength PPG.
**Inputs**: Synchronised red + IR raw ADC.

**Approach A — Ratio-of-ratios (current openwhoop)**
- Method: AC = std (or peak-trough), DC = mean per channel → R = (AC_red/DC_red) / (AC_ir/DC_ir) → SpO2 = 110 − 25·R (linear empirical). 30-sample window.
- Reference: Beer-Lambert; Maxim/ADI app notes.
- Complexity: 1/5.

**Approach B — Polynomial / rational calibration curve**
- Method: Same R, but SpO2 = a + b·R + c·R²; coefficients fit to a calibration cohort (Masimo / Nellcor curves).
- Strength: Better fit at extremes (< 88 %).
- Reference: https://www.analog.com/en/resources/technical-articles/guidelines-for-spo2-measurement--maxim-integrated.html

**Approach C — Modified Beer-Lambert with path-length correction**
- Source: https://www.mdpi.com/1424-8220/18/10/3457
- Method: Account for differential path-length factor (DPF) per wavelength; pulsatile amplitudes of HbO2/Hb concentrations.
- Trade-off: requires per-device calibration, not feasible without lab.

**Approach D — AC peak-to-trough (instead of std/mean)**
- Method: For each beat, AC = max-min of band-passed PPG; DC = local mean → ratio per beat → median-filter.
- Strength: More physically meaningful than std/mean; less sensitive to baseline drift.

**Approach E — Skin-contact + SQI gating**
- Always gate SpO2 by `skin_contact == 1` (our packet has this byte at offset 48) and a signal-quality index (offset 75-77). Without gating SpO2 is noise.

---

### Domain 2.7 — Sleep apnea & breathing-event detection

**Goal**: Flag obstructive sleep apnea / hypopnea events during sleep; estimate AHI.
**Inputs**: SpO2 trace + (optionally) PPG/accel for chest-wall motion.

**Approach A — Oxygen Desaturation Index (ODI) heuristic**
- Method: Count desaturations ≥ 3 % from baseline lasting ≥ 10 s per hour of sleep. Standard clinical proxy.
- Strength: Trivial; explainable.
- Weakness: Misses non-desaturating hypopneas.
- Complexity: 1/5.

**Approach B — OxiNet / SomnNET deep models**
- Source: https://github.com/arlenejohn/Sleep_apnea_SpO2 ("An SpO2 Based DL Technique for Sleep Apnea Detection in Smart Watches"); OxiNet *Nature Communications* 2023 https://www.nature.com/articles/s41467-023-40604-3
- Method: 1-D CNN / BiGRU on overnight SpO2 (and pulse rate) → AHI estimate.
- Performance: Reported AUC 0.95+ for moderate-to-severe OSA.
- Complexity: 4/5.

**Approach C — Apple Watch Breathing Disturbances algorithm**
- Source: https://www.apple.com/health/pdf/sleep-apnea/Sleep_Apnea_Notifications_on_Apple_Watch_September_2024.pdf
- Method: Accelerometer "breathing disturbance" pattern detection over many nights → monthly OSA-risk notification (FDA-cleared as wellness, not diagnostic).

**Approach D — Multi-scale feature ML (Sensors 2025)**
- Source: https://www.mdpi.com/1424-8220/25/6/1698
- Method: Multi-scale CNN features over wearable SpO2 → severity classification.

**Approach E — Sequential ML + questionnaire**
- Source: https://www.jmir.org/2024/1/e51615 — STOP-BANG + pulse-ox features → graded OSA screening.

---

### Domain 2.8 — Skin temperature & circadian phase

**Goal**: Track skin-temp trends as a circadian / illness biomarker; estimate circadian phase (DLMO proxy).
**Inputs**: Skin temp (1/min OK), accel, light (we don't have it on WHOOP), HR.

**Approach A — Raw scaling + baseline z-score (current openwhoop)**
- Method: temp °C = raw × 0.04; report deviation from 28-day mean. Off-wrist if raw < 100.
- Complexity: 1/5.

**Approach B — Cosinor regression for circadian period**
- Method: Fit `T(t) = M + A·cos(2π(t-φ)/τ)` to 24-h temp series; M (mesor), A (amplitude), φ (acrophase = circadian-phase proxy).
- Library: CosinorAge (below) implements; also `cosinor.py`.

**Approach C — Particle filter with limit-cycle oscillator (Forger / Hannay model)**
- Source: Weed et al. 2026 https://journals.sagepub.com/doi/10.1177/07487304251392289; reviewed https://academic.oup.com/sleep/article/44/10/zsab126/6278480
- Method: Couple a two-population circadian oscillator (Hannay 2018) to actigraphy + light + temp; particle filter updates phase. Median DLMO error ≈ 1 h.
- Complexity: 4/5.

**Approach D — Distal-proximal skin-temperature gradient**
- Sleep-onset / chronotype proxy from distal vs proximal skin temp (Krauchi). Wrist alone is "distal-only" but combined with HR-derived circadian works.

**Approach E — CosinorAge — circadian rhythmicity → biological age**
- Source: https://github.com/ADAMMA-CDHI-ETH-Zurich/CosinorAge; npj Dig Med 2024 https://www.nature.com/articles/s41746-024-01111-x
- Method: Cosinor + non-parametric circadian features (IS, IV, RA, M10, L5) over multi-day accel → trained on 80 k UK-Biobank/NHANES adults → predicts biological age. 1-yr CosinorAge increase ≈ 8-12 % higher all-cause mortality.
- **This is directly relevant to the user's longevity interest.** Open weights, pip-installable.

---

### Domain 2.9 — Strain / TRIMP / training load

**Goal**: A 0-21 (or 0-100) daily strain score; weekly load summary; injury-risk flag.
**Inputs**: HR continuous; HRmax, HRrest; optionally sRPE.

**Approach A — Edwards' zone-weighted TRIMP (current openwhoop)**
- Method: 5 zones by % HRmax (50-60 → 1, 60-70 → 2, 70-80 → 3, 80-90 → 4, 90-100 → 5); strain = sum(minutes_in_zone × weight).
- Reference: https://www.trainingimpulse.com/edwards-trimp
- WHOOP-style scaling: strain_0_21 = 21 · ln(TRIMP+1) / ln(7201) (24 h at HRmax → 21).
- Complexity: 1/5.

**Approach B — Banister's TRIMP (HRR + lactate weighting)**
- Method: TRIMP = duration · ΔHR_ratio · 0.64·exp(1.92·ΔHR_ratio) (men) / 0.86·exp(1.67·…) (women). ΔHR_ratio = (HRavg-HRrest)/(HRmax-HRrest).
- Reference: Banister 1991; https://www.trainingimpulse.com/banisters-trimp-0
- Strength: Physiologically grounded (lactate-HR exponential).
- Complexity: 2/5.

**Approach C — Lucia's TRIMP (3-zone, lactate thresholds)**
- 3 zones split by ventilatory thresholds (VT1, VT2): zone weights 1/2/3. Requires lab thresholds.
- Reference: Lucia 2003.

**Approach D — Banister Fitness-Fatigue (PerfPotential model)**
- Source: Banister 1975; https://link.springer.com/article/10.1007/BF00867927; review https://journals.humankinetics.com/view/journals/ijspp/17/5/article-p810.xml
- Method: Fitness g(t) and Fatigue h(t) are exponentially-decaying convolutions of past TRIMP with time-constants τ_g (~50 d), τ_h (~15 d); Performance ≈ k1·g − k2·h.
- Open-source impls: `fitness-fatigue-model` PyPI, GoldenCheetah implementation.
- Caveats: 2025 Sci Rep paper https://www.nature.com/articles/s41598-025-88153-7 documents identifiability problems.
- Complexity: 3/5 (parameter fitting is the hard part).

**Approach E — Acute:Chronic Workload Ratio (ACWR)**
- Source: Gabbett 2014; review https://pmc.ncbi.nlm.nih.gov/articles/PMC7047972/
- Method: ACWR = 7-day load / 28-day load. EWMA variant is more sensitive (https://docs.ropensci.org/Athlytics/reference/calculate_acwr.html). 0.8-1.3 = "sweet spot"; > 1.5 = elevated injury risk.
- Strength: One-number coaching signal.
- Caveat: methodologically contested (https://pmc.ncbi.nlm.nih.gov/articles/PMC8138569/).
- Complexity: 1/5 once you have a load metric.

**Approach F — sRPE × duration (Foster)**
- Method: sRPE (CR-10 Borg) × session minutes = subjective TL. Strongly correlates with HR-TRIMP but doesn't need HR. Best paired with objective TRIMP.
- Reference: https://www.frontiersin.org/articles/10.3389/fnins.2017.00612/full
- Use case: ground-truth label for ML strain models on days of bad PPG.

---

### Domain 2.10 — Recovery / readiness scoring

**Goal**: Daily 0-100 number combining recovery from prior load with current autonomic state.
**Inputs**: HRV (RMSSD), RHR, sleep quantity/quality, respiratory rate, sometimes SpO2, skin temp, sRPE.

**Approach A — Z-score-of-baseline weighted formula (WHOOP-style)**
- Per-metric 60-day rolling baseline; z-score; weighted sum:
  recovery = sigmoid(0.5·z_HRV + 0.2·(−z_RHR) + 0.15·z_sleep + 0.1·(−z_resp) + 0.05·z_SpO2)
- Strength: No labels needed; matches WHOOP/Oura mental model.
- Complexity: 2/5.

**Approach B — Polar Nightly Recharge (ANS + Sleep charges)**
- Source: https://support.polar.com/us-en/nightly-recharge-recovery-measurement
- Method: Two sub-scores compared to 28-day baseline:
  - **ANS charge** = HR + RMSSD + RR over first ~4 h sleep (HR weighted highest).
  - **Sleep charge** = duration + interruptions + REM%.
- Each → "much below / below / usual / above / much above" relative to baseline.
- Strength: Focuses on early-night autonomic signal where parasympathetic recovery is strongest.

**Approach C — Garmin / Firstbeat Body Battery**
- Source: https://www8.garmin.com/garminhealth/news/Garmin-Enhanced-BBI_Final.pdf
- Method: Continuous HRV-driven model; "drains" with stress/exercise (proportional to sympathetic dominance estimate × VO2max-scaled rate), "charges" with rest. 0-100 score.
- Closed but extensively documented in white papers.

**Approach D — Oura Readiness**
- Combines sleep, HRV, RHR, body-temperature deviation, respiratory rate, prior-day activity. Weights are proprietary; see https://ouraring.com/science-and-research.

**Approach E — ML recovery model (per-user gradient boosting)**
- Method: Treat next-day performance / sRPE / subjective wellness as label; XGBoost on HRV, RHR, sleep, temp deviation, prior-day load. Train per-user once you have ~60 days.
- Strength: Adapts to individual.
- Weakness: Needs labels (best obtained from morning subjective + occasional performance test).
- Complexity: 3/5.

**Approach F — Allostatic load index (composite physiological strain)**
- Reference: Seeman/McEwen original; clinical models combine 7-10 biomarkers (cortisol, BP, etc.). Not directly buildable from wearable alone, but a *wearable allostatic-load proxy* can be constructed from chronically elevated RHR + suppressed HRV + sleep-debt + skin-temp drift.

---

### Domain 2.11 — Lifespan / longevity indices

**Goal**: Long-horizon health markers (biological age, cardiorespiratory fitness, mortality-risk proxies) usable as user-facing "longevity" feedback.

**Approach A — VO2max via Cooper test (12-min run)**
- VO2max = 22.351 · km_in_12_min − 11.288. Needs distance.

**Approach B — Rockport 1-mile walk test**
- VO2max = 132.853 − 0.0769·lbs − 0.3877·age + 6.315·sex − 3.2649·minutes − 0.1565·HR_finish. Needs walk timing + finish HR.

**Approach C — HRR-based VO2max (Uth-Sørensen-Overgaard ratio)**
- Source: https://pubmed.ncbi.nlm.nih.gov/14624296/
- Method: VO2max ≈ 15 · (HRmax / HRrest). Trivially computed from passive wearable data — no test needed.
- Strength: Daily passive estimate; adapts as fitness changes.
- Weakness: ±5 ml/kg/min uncertainty.

**Approach D — Firstbeat / Garmin walking-VO2max model**
- Source: https://www.firstbeat.com/wp-content/uploads/2015/10/white_paper_vo2_estimation.pdf
- Method: Submaximal HR-vs-pace regression during walks/runs → VO2max. Garmin's run-based version is widely validated.

**Approach E — Cardiorespiratory fitness from passive HR + steps**
- Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC10517160/ (3115-subject model)
- Method: Random forest on age, sex, BMI, daily step counts, HR responses → VO2max. MAE ≈ 3.95 ml/kg/min on test set.
- Strength: No prescribed test required.
- Complexity: 3/5.

**Approach F — Biological age: PhenoAge (Levine)**
- 9 blood biomarkers (albumin, creatinine, glucose, CRP, lymphocyte%, MCV, RDW, alkaline phosphatase, WBC) + chronological age → mortality-trained Gompertz. Not wearable-derived but the user can integrate lab data.
- Library: https://github.com/dayoonkwon/BioAge (R; computes KDM, PhenoAge, HD).

**Approach G — Klemera-Doubal Method (KDM) biological age**
- Statistical regression of multiple biomarkers vs CA → BA estimate that minimises distance to expected aging trajectory. Same library as PhenoAge.

**Approach H — CosinorAge (wearable-derived biological age)**
- Source: https://github.com/ADAMMA-CDHI-ETH-Zurich/CosinorAge (Python + web)
- Method: Cosinor params (mesor, amplitude, acrophase) + non-parametric circadian features (IS, IV, RA, M10, L5) on 7+ days of accel → trained model → biological age in years. Open weights from UK Biobank / NHANES.
- Strength: Built specifically for our data type (wrist accel).
- Complexity: 2/5 to integrate (pip install + feed accel CSV).

**Approach I — Resting HR & HRV trend longevity proxies**
- Evidence: every 10 BPM RHR ↑ → 1.09× all-cause mortality (https://pmc.ncbi.nlm.nih.gov/articles/PMC4754196/). Long-term RHR rise → 65 % more HF, 69 % more death (https://www.heart.org/en/news/2024/11/22/...). HRV inversely associated with all-cause mortality (https://www.frontiersin.org/articles/10.3389/fphys.2020.566399/).
- Implementable as: 90-day rolling RHR slope + HRV slope → "trajectory health" score.

---

## 3. Comparison matrices

### 3.1 Sleep staging approaches

| Approach | Sensors | Classes | Reported κ | Open code | Train data needed | Run cost |
|---|---|---|---|---|---|---|
| Gravity-delta heuristic | Accel | 2 (W/S) | n/a | yes (openwhoop) | none | very low |
| **noop quantile-v1 (ours)** | HR + Accel + IBI | 4 | n/a (no ground truth) | yes (this repo) | none | very low |
| Walch RF/NN | Accel + HR | 2-3 | ~0.55 | yes | small (PSG) | low |
| SleepPPG-Net | Raw PPG | 4 | 0.75 | yes (community impl) | MESA + CFS | medium |
| Dual-stream PPG+Accel | PPG + Accel | 4 | 0.74 | yes (DavyWJW) | MESA + DREAMT | medium |
| InsightSleepNet | PPG | 4 | 0.70 + uncertainty | partial | MESA | medium |
| Apple Watch | Accel | 4 | ~0.55-0.60 | no | private | low |
| Oura OSSA 2.0 | PPG+IR+Accel+T | 4 | 0.62 | no | private | n/a |
| YASA | EEG/EOG/EMG | 5 | 0.79 | yes (BSD-3) | n/a (pretrained) | low |

### 3.2 HRV libraries

| Lib | Lang | License | Time | Freq | Non-lin | Real-time | Notes |
|---|---|---|---|---|---|---|---|
| NeuroKit2 | Py | MIT | yes | yes (Welch/AR/LS) | yes | partial | 124 metrics; multi-modal |
| pyHRV | Py | BSD-3 | yes | yes | yes | no | 78 metrics; plotting |
| hrv-analysis (Aura) | Py | GPL-3 | yes | yes | yes | partial | clean API |
| HeartPy | Py / C | MIT | yes | partial | partial | yes | PPG-noise robust |
| RapidHRV | Py | MIT | yes | partial | no | yes | live extraction |
| cardio-rs | Rust | MIT/Apache | yes | yes | yes | yes | `no_std`; embedded |
| hrv-rs | Rust | MIT | yes | partial | yes | yes | BLE chest strap |

### 3.3 Vendor recovery scores

| Vendor | Inputs | Mechanism | Validation |
|---|---|---|---|
| WHOOP Recovery | HRV (RMSSD), RHR, sleep, resp, SpO2, skin T | Per-user baseline z-score → 0-100 % | Internal; closed |
| Oura Readiness | HRV, RHR, T deviation, sleep, prior activity | Weighted, baseline-relative | Multiple peer-reviewed |
| Garmin Body Battery | HRV (RMSSD), stress, sleep, activity (Firstbeat) | Drain/charge dynamic 0-100 | Vendor white paper |
| Polar Nightly Recharge | First 4 h HR/HRV/RR + full-night sleep | ANS charge + Sleep charge, 28-day baseline | Vendor docs + papers |

### 3.4 PPG motion-artefact methods

| Method | Compute | Needs accel? | Best for | Output |
|---|---|---|---|---|
| Bandpass + adaptive peak | very low | no | rest / sleep | RR, HR |
| Wavelet denoise | low | no | mild motion | clean PPG |
| LMS/RLS adaptive | low-med | yes | walking | clean PPG |
| TROIKA | medium-high | yes | running, sport | HR (not RR) |
| Kalman on HR | very low | no | smoothing | HR |
| E2E-PPG pipeline | medium | yes | full nights | RR, HRV |

---

## 4. Open datasets for validation

| Dataset | Subjects / Hours | Signals | License | Use |
|---|---|---|---|---|
| **MESA** (NSRR) | 1,817 / multi-night | PSG + actigraphy + (a subset) PPG | NSRR DUA — request | Sleep stage train/val |
| **DREAMT** v2.1 (PhysioNet) | 100 / overnight | E4 PPG + accel + EDA + temp + PSG labels | PhysioNet credentialed | Wearable sleep stages |
| **SleepAccel / Walch** | 31 | Apple Watch HR + accel + PSG | Open (ojwalch/sleep_classifiers + Kaggle mirror) | PSG-labelled wearable |
| **CFS (Cleveland Family Study)** | ~2,000 | PSG + raw PPG | NSRR DUA | SleepPPG-Net training |
| **Sleep-EDF / Sleep-EDFx** | 197 / 78 nights | PSG | PhysioNet open | YASA training |
| **NCH Sleep DataBank** | 3,984 children | PSG | PhysioNet credentialed | Pediatric sleep |
| **MIT-BIH Arrhythmia** | 47 records | ECG | PhysioNet open | ECG/HRV reference |
| **PhysioNet 2017 / 2018 Challenges** | varies | ECG / PPG / sleep | PhysioNet open | Standard benchmarks |
| **UCI HAR** | 30 / ~500 windows × 6 classes | Smartphone accel+gyro 50 Hz | UCI open | HAR baseline |
| **WISDM (rWISDM)** | 51 / 18 activities | Smartphone+watch accel+gyro | Open | HAR multi-class |
| **PAMAP2** | 9 / 18 activities | IMU + HR | UCI open | Sport-class HAR |
| **Opportunity** | 4 / kitchen activities | Body IMU array | UCI open | Long-context HAR |
| **WESAD** | 15 | Empatica E4 + RespiBAN | Open | Stress detection |
| **TROIKA dataset** | 12 | Wrist PPG + accel during running | Open | Motion-PPG HR |
| **UK Biobank Accelerometer** | ~100 k | Wrist 30 Hz raw accel | Application required | HAR pretraining (OxWearables uses) |
| **Apple Heart Study** (atrial fib) | 419k (summary) | PPG events | Aggregated only | Reference statistics |
| **Charlton RRest datasets** | varied | PPG + capnography | Open | Respiratory rate |
| **OxWalk** | 39 | Wrist accel + camera-truth steps | Open | Step-count fine-tune |

---

## 5. Papers / standards worth reading

**Sleep**
- Walch et al., *SLEEP* 2019 — Apple Watch RF sleep stager; introduced "clock proxy" feature (https://academic.oup.com/sleep/article/42/12/zsz180/5549536).
- Kotzen et al., *IEEE TBME* 2022 — SleepPPG-Net (https://peterhcharlton.github.io/publication/kotzen-2022/).
- Vallat & Walker, *eLife* 2021 — YASA universal staging (https://elifesciences.org/articles/70092).
- Apple, *Estimating Sleep Stages from Apple Watch* Oct 2025 (https://www.apple.com/health/pdf/Estimating_Sleep_Stages_from_Apple_Watch_Oct_2025.pdf).
- Apple, *Estimating Breathing Disturbances and Sleep Apnea Risk* Sep 2024 (https://www.apple.com/health/pdf/sleep-apnea/Sleep_Apnea_Notifications_on_Apple_Watch_September_2024.pdf).
- Chinoy et al. — performance validation of 6 commercial wearables vs PSG (https://academic.oup.com/sleepadvances/article/6/2/zpaf021/8090472).

**HRV**
- Task Force *Circulation* 1996 — original HRV standards (still cited).
- Clifford & Tarassenko 2004 — spectral errors from beat-detection (https://www.robots.ox.ac.uk/~gari/papers/CliffordTBME2004-Publish.pdf).
- Pellegrino et al. 2022 — NeuroKit2 sleep-physiology pipeline (https://pmc.ncbi.nlm.nih.gov/articles/PMC9307944/).
- Baevsky 2017 / 2024 review of stress index (https://journals.physiology.org/doi/full/10.1152/ajpregu.00243.2024).

**PPG**
- Charlton, *Photoplethysmography Signal Processing & Synthesis* 2021 chapter (https://peterhcharlton.github.io/publication/ppg_sig_proc_chapter/).
- Zhang et al. 2014 — TROIKA framework (https://ar5iv.labs.arxiv.org/html/1409.5181).
- Karlen 2013 — Smart Fusion respiratory rate (https://pubmed.ncbi.nlm.nih.gov/23399950/).

**Activity / Step**
- Straczkiewicz et al., npj Digital Medicine 2022 — one-size-fits-most walking detection (https://www.nature.com/articles/s41746-022-00745-z).
- Small et al. — OxWearables stepcount foundation model (https://github.com/OxWearables/stepcount).

**Training load**
- Banister 1991 — TRIMP definition.
- Edwards 1993 — zone TRIMP.
- Foster — sRPE method (https://www.frontiersin.org/articles/10.3389/fnins.2017.00612/full).
- Gabbett 2014 — ACWR (https://pmc.ncbi.nlm.nih.gov/articles/PMC7047972/).

**Longevity / Bio-age**
- Levine 2018 — PhenoAge.
- Klemera & Doubal 2006 — KDM biological age.
- CosinorAge, npj Digital Medicine 2024 (https://www.nature.com/articles/s41746-024-01111-x).
- Resting-HR mortality meta (https://pmc.ncbi.nlm.nih.gov/articles/PMC4754196/).

**Circadian**
- Hannay & Forger 2018 — two-population circadian oscillator.
- Weed et al. 2026 — particle-filter circadian phase with wearables (https://journals.sagepub.com/doi/10.1177/07487304251392289).

**WHOOP-specific RE write-ups**
- bWanShiTong, *reverse-engineering-whoop-post* — definitive protocol doc.
- jogolden, *whoomp* — first community Web-Bluetooth client.

---

## 6. Recommendations for our codebase

### 6.1 Where we stand today (per `RESEARCH.md`)

_Last updated 2026-05-11 after the quantile-v1 sleep classifier and recovery-formula warmup-gate shipped._

| Capability | Status | Approach used |
|---|---|---|
| BLE protocol | Working | whoomp Python + JS |
| 96-byte sensor decode | Working | openwhoop V12/V24 parser |
| Sleep / wake detection | Working | gravity-delta still-time heuristic |
| Activity classification | Partial | cadence-FFT (walking/running) |
| HRV time-domain | Working | RMSSD + EliteHRV norm |
| HRV freq-domain | Partial | Welch (whoomp JS only) |
| Strain | Working | Edwards TRIMP |
| Stress | Working | Baevsky SI |
| SpO2 | Working | Beer-Lambert ratio-of-ratios |
| Skin temp | Working | raw × 0.04 |
| **Sleep stages (4-class)** | **Working (`quantile-v1`)** | Rank-allocate epochs to priors (Wake 8 % / REM 22 % / Deep 20 % / Core remainder) by per-epoch HR/motion/HRV scores; median smoothing + run suppression + nearest-neighbour densification. See `apps/backend/src/processing/sleep-stage-classifier.ts`. Replaces RF v1 which produced 28 % awake / 0 % REM on real-strap data. |
| Recovery score | Working but unvalidated | `65 + hrvBoost + continuityBoost + regularityBoost − rhrPenalty`. RHR/HRV deltas now gated on `baseline.isWarmedUp` (≥5 nights) — before that, only continuity/regularity contribute. See §6.7 below for known limitations vs WHOOP's actual formula. |
| Sleep apnea screen | **Missing** | — |
| Respiratory rate | **Decoded but unused** | — |
| Activity types beyond walk/run | **Missing** | — |
| Hill / barometer | **Missing (no sensor)** | — |
| VO2max | **Missing** | — |
| Biological age / longevity | **Missing** | — |

### 6.2 What to adopt next, in priority order

**Tier 1 — quick wins (≤ 1 week each)**

1. **Surface respiratory rate from `resp_rate_raw`** (offset 73-75 in V12/V24). Calibrate against NeuroKit2's PPG-derived RR on a few sessions to get a scaling constant. Adds a metric users notice immediately. Difficulty 1.
2. **Add pNN50 + SD1/SD2 Poincaré** to HRV output. Free given current RR pipeline; opens the door to nicer "stress" visualisations (Poincaré ellipse). Difficulty 1.
3. **Recovery score v0 — z-score formula** (Approach 2.10A). Roll a 60-day baseline for HRV, RHR, resp, sleep duration; emit one number. Beats nothing, and gives us a label proxy to retrain later. Difficulty 2.
4. **Acute:Chronic Workload Ratio (EWMA variant)** on top of the existing Edwards TRIMP. Surface as "load balance" / injury-risk flag. Difficulty 1. (Reference: `Athlytics::calculate_acwr`.)
5. **Lomb-Scargle frequency-domain HRV** (instead of Welch). Avoids resampling bias on irregular RR. `astropy.timeseries.LombScargle` — ~30 lines. Difficulty 2.

**Tier 2 — medium-term (2-4 weeks)**

6. **Adopt NeuroKit2 as the canonical HRV backend.** Replaces our hand-rolled RMSSD/SDNN with a 124-metric, peer-reviewed pipeline. Keeps Baevsky SI on top. Difficulty 2.
7. **Sleep staging via Walch RF/NN baseline**. Use https://github.com/ojwalch/sleep_classifiers as starter; features = activity counts + HR std + clock proxy + (added) HRV bands per 30-s. Train on SleepAccel (open). Expect κ ~ 0.55 — already a 4-class hypnogram. Difficulty 3.
8. **CosinorAge integration**. Pip-install the package, pass our daily accel exports → daily "biological age". Directly addresses the longevity ask. Open weights, no training. Difficulty 2.
9. **HAR upgrade with OxWearables SSL backbone**. Use the pretrained ResNet-V2-18 from `OxWearables/ssl-wearables` as a frozen encoder; add a small linear head trained on personal labels (we self-label cycling/strength/etc.). Difficulty 3.
10. **VO2max passive estimate** via Uth ratio (15 · HRmax/HRrest), reported daily. Augment with Firstbeat-style submaximal HR-vs-cadence regression once activity classifier is in. Difficulty 2.

**Tier 3 — longer-term research (1-3 months each)**

11. **Sleep staging via SleepPPG-Net**. Adapt the dual-stream model (https://github.com/DavyWJW/sleep-staging-models) to consume our PPG (real-time RAW mode at offset [26:30]) + accel. Targets κ ~ 0.7. Need MESA/CFS access via NSRR for training. Difficulty 4.
12. **Sleep apnea screening** via OxiNet / SomnNET on overnight SpO2. Easiest: start with ODI≥3 % heuristic, then layer the DL model when validated. Difficulty 4.
13. **Personalised ML recovery model**. Once we have ~60 days of self-rated readiness + sRPE, train per-user XGBoost on (HRV, RHR, sleep, T deviation, prior load) → readiness. Should outperform formula. Difficulty 3.
14. **Banister Fitness-Fatigue model** for performance prediction with Kalman-feedback fitting (https://www.researchgate.net/publication/321637829). Useful for users serious about training peaks; respect the 2025 identifiability caveats. Difficulty 4.
15. **Particle-filter circadian phase** on accel + skin-temp + HR (Hannay model). Lets us emit "your circadian midpoint is X" and recommend light exposure. Difficulty 4.

### 6.3 What we *can't* do without new hardware
- Hill / sustained ascent: WHOOP 4.0 has no barometer. Either skip, or fuse a phone barometer when paired.
- True swim metrics: PPG fails underwater; we'd need accel-only swim detection (Approach 2.2H) — feasible but signals are weak.
- ECG-grade HRV: WHOOP is PPG only. Best we can do is the wavelet/Kalman/TROIKA stack.

### 6.4 Validation strategy
- Use **DREAMT v2.1** (Empatica E4 PPG/accel + PSG labels) as the closest open analog to our sensors for sleep-stage validation.
- Use **SleepAccel / Walch** for the simpler 2-3 class baseline.
- Run NeuroKit2 + our pipeline on **MIT-BIH** ECG to confirm RR-derived HRV matches reference values within < 5 %.
- For activity: hold out one user-day with a phone-mounted GPS log + manually labelled segments as the in-house ground truth.

### 6.5 License hygiene
- All Tier 1+2 picks are MIT / BSD-3 / Apache (NeuroKit2 MIT; OxWearables Apache-2.0; CosinorAge open; Walch MIT-style; Athlytics MIT).
- `hrv-analysis` (Aura) is **GPL-3** — fine for our backend, *not* fine if we ever ship code linked into a closed mobile binary. Prefer NeuroKit2 to avoid the question.
- TROIKA is academic; reimplementations exist permissively.
- Apple/Oura/Garmin/Polar references are **read-for-design only** — no code reuse possible.

### 6.6 Suggested entry points (concrete next steps)
1. Add `respiratory_rate` to the `Sensor` model and persist it; plot it.
2. Add `nk.hrv()` call alongside existing RMSSD; add SD1/SD2 columns.
3. Write `recovery_v0.py` that computes the z-score formula on the last 60 days; expose via API.
4. Spike `cosinorage` against 14 days of our IMU dump → sanity-check biological-age output.
5. Pull `sleep_classifiers` + DREAMT subset; reproduce Walch's RF on our pipeline; deploy as the first 4-class sleep stager.

### 6.7 Session 2026-05-11 learnings

**Sleep staging:** We trained a small RF (`sleep-rf-v1.json`, 3 trees, 21 features) on a synthetic-ish dataset months ago and it shipped to prod. Against real strap captures (5h 38m night, ~22 % epoch coverage from sparse 1-Hz records) it produced 28 % awake / 0 % REM / 5 % deep — wildly out of plausible sleep architecture. Three local methods were compared in one evening:

| Variant | Awake | REM | Core | Deep | Notes |
|---|---|---|---|---|---|
| RF v1 baseline | 28 % | 0 % | 67 % | 5 % | NaN tree paths bias the model toward Wake when features are missing |
| densify-v2 (carry-forward features) | 39 % | 4 % | 49 % | 8 % | Stale features replicate Wake-leaning paths |
| Physio hard gates | 2 % | 2 % | 70 % | 26 % | HR range too narrow (55-89 bpm) for fixed thresholds |
| **Quantile-priors (shipped)** | 5 % | 23 % | 52 % | 21 % | Score per epoch, rank-allocate to typical adult priors |
| Walch-style (motion gate → HRV split) | 2 % | 22 % | 55 % | 22 % | Comparable; Walch refused to fire awake on a low-motion night |

Local eval harness writes HTML reports to the brainstorm visual companion. Scripts at `apps/backend/scripts/{fetch-night,fetch-recent,raw-eval}.ts` (the physio/quantile/walch/compare eval scripts were deleted after the winner was chosen).

**Recovery formula bug:** `wellness-scoring.ts::computeDailyScore` computed `rhrPenalty = max(0, rhr − baseline_rhr) × 1.5`. Before warmup (<5 nights), `baseline_rhr = 0`, so a healthy 59 bpm became an 88-point penalty and recovery clamped to ~9. Fix: both `rhrPenalty` and `hrvBoost` now early-return 0 when `baseline.isWarmedUp === false`. Production recovery for the test user jumped 9 → 79 after redeploy.

**Mobile hypnogram doubling bug:** `HypnogramChart.tsx::epochsToSegments` named its outputs `fromMin`/`toMin` but they were really epoch indices (0.5 min each). Stage durations and the cursor tooltip displayed every total at 2× actual. Fix: chart now takes an `epochMinutes` prop (default 0.5) and multiplies only at display time; internal x-axis math stays in epoch units.

**Home view ring bugs:** Recovery showed `9%%` (backend already formatted with `%`, mobile re-appended). Sleep tile showed sleep-duration attainment (66 %) while the detail page showed the sleep score (71) — users read both as "the same number". Fixes: mobile uses backend `value` verbatim, and `getHomeView` now calls `computeSleepScoreForNight` so the home Sleep ring mirrors the detail page.

**Build-tooling gotcha:** Adding `.ts` files under `apps/backend/scripts/` moved TypeScript's inferred rootDir up one level (common ancestor of `src/` and `scripts/`), so `nest build` emitted `dist/src/foo.js` instead of `dist/foo.js`. The Cloud Run migration job hard-codes `apps/backend/dist/typeorm.datasource.js`, which broke deploy. Fix: exclude `scripts/` from `tsconfig.build.json`. Scripts remain runnable via `pnpm tsx`.

**Open questions surfaced today:**
- Quantile-v1 lands at ~11 % REM on real prod data (vs 23 % in local eval) because in prod the classifier sees only the sparse real epochs, then densifies. Should we densify features before classification so the priors apply over wall-clock minutes?
- Recovery formula is still a hand-coded heuristic. The research §2.10 z-score approach (Tier 1 #3 in §6.2) would be a principled replacement and is on the roadmap.
- We have no per-epoch ground truth. To validate any classifier we need a labelled night — either a PSG study, or at minimum a WHOOP-side hypnogram exported for the same night the user wore both straps.

---

*End of knowledge base. Update by re-running the searches in Section 5 every ~6 months — the sleep-staging field publishes a new SOTA roughly twice a year.*
