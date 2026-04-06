"""Train a Random Forest classifier on extracted sleep epoch features."""

import os
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import classification_report, confusion_matrix

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
FEATURES_CSV = os.path.join(DATA_DIR, "features.csv")
MODEL_OUTPUT = os.path.join(
    os.path.dirname(__file__),
    "..",
    "src",
    "processing",
    "models",
    "sleep-rf-v1.json",
)

FEATURE_NAMES = [
    "hrMean", "hrStd", "hrMin", "hrMax", "hrDeltaFromBaseline",
    "motionMagnitude", "motionStd", "motionCount", "stillFraction",
    "rmssd", "sdnn", "rrMean",
    "respiratoryRate", "respiratoryStd",
    "spo2", "skinTemp", "skinTempDelta",
    "clockSin", "clockCos", "skinContact", "signalCompleteness",
]

LABEL_MAP = {"Wake": 0, "Light": 1, "Deep": 2, "REM": 3}
LABEL_NAMES = ["Wake", "Light", "Deep", "REM"]


def train() -> RandomForestClassifier:
    print("[train] Loading features...")
    df = pd.read_csv(FEATURES_CSV)
    print(f"  {len(df)} epochs, {df['subject'].nunique()} subjects")

    X = df[FEATURE_NAMES].values.astype(np.float32)
    y = df["label"].map(LABEL_MAP).values

    X = np.nan_to_num(X, nan=-999.0)

    print("[train] 5-fold stratified cross-validation...")
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=15,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    y_pred = cross_val_predict(clf, X, y, cv=skf)

    print("\n[results] Cross-validation classification report:")
    print(classification_report(y, y_pred, target_names=LABEL_NAMES))
    print("[results] Confusion matrix:")
    print(confusion_matrix(y, y_pred))

    print("\n[train] Training final model on all data...")
    clf.fit(X, y)

    return clf


def export_model(clf: RandomForestClassifier) -> None:
    from export_model import export_rf_to_json

    model_json = export_rf_to_json(clf, FEATURE_NAMES)

    os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)
    with open(MODEL_OUTPUT, "w") as f:
        json.dump(model_json, f, indent=None)

    file_size_mb = os.path.getsize(MODEL_OUTPUT) / (1024 * 1024)
    print(f"[export] Model saved to {MODEL_OUTPUT} ({file_size_mb:.1f} MB)")


def main() -> None:
    if not os.path.exists(FEATURES_CSV):
        print(f"[error] Features file not found: {FEATURES_CSV}")
        print("  Run extract_features.py first.")
        return

    clf = train()
    export_model(clf)
    print("[done] Training complete.")


if __name__ == "__main__":
    main()
