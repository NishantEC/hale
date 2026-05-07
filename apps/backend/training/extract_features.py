"""Extract 21 epoch features from sleep-accel dataset.

Produces a CSV with one row per 30-second epoch:
  21 feature columns + 1 label column (Wake/Light/Deep/REM).

The same 21 features as epoch-features.ts:
  hrMean, hrStd, hrMin, hrMax, hrDeltaFromBaseline,
  motionMagnitude, motionStd, motionCount, stillFraction,
  rmssd, sdnn, rrMean,
  respiratoryRate, respiratoryStd,
  spo2, skinTemp, skinTempDelta,
  clockSin, clockCos, skinContact, signalCompleteness
"""

import os
import glob
import math
import numpy as np
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "data", "features.csv")
EPOCH_SECONDS = 30

# PSG label mapping: sleep-accel uses 0=Wake, 1=N1, 2=N2, 3=N3, 5=REM
# We map: 0→Wake, 1→Light, 2→Light, 3→Deep, 5→REM
PSG_MAP = {0: "Wake", 1: "Light", 2: "Light", 3: "Deep", 5: "REM"}


def compute_rmssd(ibis: np.ndarray) -> float:
    if len(ibis) < 2:
        return float("nan")
    diffs = np.diff(ibis)
    return float(np.sqrt(np.mean(diffs ** 2)))


def compute_sdnn(ibis: np.ndarray) -> float:
    if len(ibis) < 2:
        return float("nan")
    return float(np.std(ibis, ddof=0))


def extract_epoch_features(
    hr_values: np.ndarray,
    motion_values: np.ndarray,
    epoch_timestamp_hour: float,
    night_median_hr: float,
) -> dict:
    """Extract features for a single 30s epoch from available signals.

    sleep-accel provides HR and motion (actigraphy counts).
    IBI, respiratory, SpO2, temperature are not available → NaN.
    """
    valid_hr = hr_values[hr_values > 0]
    hr_mean = float(np.mean(valid_hr)) if len(valid_hr) > 0 else float("nan")
    hr_std = float(np.std(valid_hr, ddof=0)) if len(valid_hr) >= 2 else 0.0
    hr_min = float(np.min(valid_hr)) if len(valid_hr) > 0 else float("nan")
    hr_max = float(np.max(valid_hr)) if len(valid_hr) > 0 else float("nan")
    hr_delta = (
        (hr_mean - night_median_hr) / night_median_hr
        if night_median_hr > 0 and not math.isnan(hr_mean)
        else float("nan")
    )

    motion_magnitude = float(np.mean(motion_values)) if len(motion_values) > 0 else float("nan")
    motion_std_val = float(np.std(motion_values, ddof=0)) if len(motion_values) >= 2 else 0.0
    still_threshold = 0.01
    motion_count = int(np.sum(motion_values > still_threshold)) if len(motion_values) > 0 else 0
    still_fraction = (
        float(np.sum(motion_values <= still_threshold) / len(motion_values))
        if len(motion_values) > 0
        else float("nan")
    )

    clock_sin = math.sin(2 * math.pi * epoch_timestamp_hour / 24)
    clock_cos = math.cos(2 * math.pi * epoch_timestamp_hour / 24)

    available = sum(
        1
        for v in [hr_mean, hr_std, hr_min, hr_max, hr_delta,
                   motion_magnitude, motion_std_val, motion_count, still_fraction]
        if not (isinstance(v, float) and math.isnan(v))
    )
    signal_completeness = (available + 3) / 21  # +3 for clockSin, clockCos, skinContact

    return {
        "hrMean": hr_mean,
        "hrStd": hr_std,
        "hrMin": hr_min,
        "hrMax": hr_max,
        "hrDeltaFromBaseline": hr_delta,
        "motionMagnitude": motion_magnitude,
        "motionStd": motion_std_val,
        "motionCount": motion_count,
        "stillFraction": still_fraction,
        "rmssd": float("nan"),
        "sdnn": float("nan"),
        "rrMean": float("nan"),
        "respiratoryRate": float("nan"),
        "respiratoryStd": float("nan"),
        "spo2": float("nan"),
        "skinTemp": float("nan"),
        "skinTempDelta": float("nan"),
        "clockSin": clock_sin,
        "clockCos": clock_cos,
        "skinContact": 1.0,
        "signalCompleteness": signal_completeness,
    }


def process_sleep_accel() -> pd.DataFrame:
    """Process the sleep-accel dataset into feature rows."""
    accel_dir = os.path.join(DATA_DIR, "sleep-accel")
    if not os.path.exists(accel_dir):
        print(f"[error] sleep-accel not found at {accel_dir}. Run download_data.py first.")
        return pd.DataFrame()

    subject_dirs = sorted(glob.glob(os.path.join(accel_dir, "*")))
    all_rows = []

    for subject_path in subject_dirs:
        if not os.path.isdir(subject_path):
            continue

        hr_file = os.path.join(subject_path, "heart_rate.txt")
        motion_file = os.path.join(subject_path, "motion.txt")
        labels_file = os.path.join(subject_path, "labels.txt")

        hr_file_alt = os.path.join(subject_path, "heart_rate.csv")
        if not os.path.exists(hr_file) and os.path.exists(hr_file_alt):
            hr_file = hr_file_alt

        required_files = [hr_file, motion_file, labels_file]
        if not all(os.path.exists(f) for f in required_files):
            continue

        try:
            hr_data = np.loadtxt(hr_file, delimiter=",") if hr_file.endswith(".csv") else np.loadtxt(hr_file)
            motion_data = np.loadtxt(motion_file, delimiter=",") if motion_file.endswith(".csv") else np.loadtxt(motion_file)
            labels = np.loadtxt(labels_file, dtype=int)
        except Exception as e:
            print(f"[warn] Could not load {subject_path}: {e}")
            continue

        if motion_data.max() > 0:
            motion_norm = motion_data / motion_data.max()
        else:
            motion_norm = motion_data

        night_median_hr = float(np.median(hr_data[hr_data > 0])) if np.any(hr_data > 0) else 60.0

        n_epochs = min(len(labels), len(hr_data) // max(1, EPOCH_SECONDS))

        for epoch_idx in range(n_epochs):
            label_raw = int(labels[epoch_idx])
            if label_raw not in PSG_MAP:
                continue

            label = PSG_MAP[label_raw]

            hr_start = epoch_idx * EPOCH_SECONDS
            hr_end = min(hr_start + EPOCH_SECONDS, len(hr_data))
            epoch_hr = hr_data[hr_start:hr_end]

            motion_start = epoch_idx * EPOCH_SECONDS
            motion_end = min(motion_start + EPOCH_SECONDS, len(motion_norm))
            epoch_motion = motion_norm[motion_start:motion_end]

            epoch_hour = (22.0 + (epoch_idx * EPOCH_SECONDS / 3600)) % 24

            features = extract_epoch_features(
                epoch_hr, epoch_motion, epoch_hour, night_median_hr
            )
            features["label"] = label
            features["subject"] = os.path.basename(subject_path)
            all_rows.append(features)

    return pd.DataFrame(all_rows)


def main() -> None:
    print("[extract] Processing sleep-accel dataset...")
    df = process_sleep_accel()

    if df.empty:
        print("[error] No features extracted. Check dataset download.")
        return

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"[done] Extracted {len(df)} epochs from {df['subject'].nunique()} subjects → {OUTPUT_CSV}")
    print(f"  Label distribution: {df['label'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
