"""Export a scikit-learn RandomForestClassifier to JSON for Node.js inference."""

import json
import numpy as np
from sklearn.ensemble import RandomForestClassifier


def export_rf_to_json(
    clf: RandomForestClassifier, feature_names: list[str]
) -> dict:
    """Convert a trained RF to our JSON model format."""
    trees = []
    for estimator in clf.estimators_:
        tree = estimator.tree_
        nodes = []
        for i in range(tree.node_count):
            if tree.children_left[i] == -1:
                counts = tree.value[i][0]
                total = counts.sum()
                probs = (counts / total).tolist() if total > 0 else [0.25] * 4
                nodes.append({
                    "featureIndex": -1,
                    "threshold": 0,
                    "left": -1,
                    "right": -1,
                    "value": [round(p, 4) for p in probs],
                })
            else:
                nodes.append({
                    "featureIndex": int(tree.feature[i]),
                    "threshold": round(float(tree.threshold[i]), 6),
                    "left": int(tree.children_left[i]),
                    "right": int(tree.children_right[i]),
                })
        trees.append({"nodes": nodes})

    return {
        "nEstimators": len(clf.estimators_),
        "nFeatures": clf.n_features_in_,
        "featureNames": feature_names,
        "trees": trees,
    }


def main() -> None:
    import pickle
    import sys

    if len(sys.argv) < 2:
        print("Usage: python export_model.py <model.pkl> [output.json]")
        sys.exit(1)

    model_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "sleep-rf-v1.json"

    with open(model_path, "rb") as f:
        clf = pickle.load(f)

    feature_names = [
        "hrMean", "hrStd", "hrMin", "hrMax", "hrDeltaFromBaseline",
        "motionMagnitude", "motionStd", "motionCount", "stillFraction",
        "rmssd", "sdnn", "rrMean",
        "respiratoryRate", "respiratoryStd",
        "spo2", "skinTemp", "skinTempDelta",
        "clockSin", "clockCos", "skinContact", "signalCompleteness",
    ]

    model_json = export_rf_to_json(clf, feature_names)

    with open(output_path, "w") as f:
        json.dump(model_json, f, indent=None)

    print(f"Exported to {output_path}")


if __name__ == "__main__":
    main()
