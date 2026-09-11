"""Train a compact decision tree and export it as Vela-compatible JavaScript.

The default dataset is deterministic synthetic feature data for wiring and
competition demos. Replace it with labelled, ethically collected wearable IMU
features before making real-world performance claims.
"""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path
from typing import Iterable

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "src" / "common" / "generated-model.js"
DEFAULT_CSV = ROOT / "datasets" / "training_features.csv"

FEATURE_NAMES = [
    "peakG",
    "minG",
    "variance",
    "postVariance",
    "orientationChange",
    "lowMotionRatio",
    "durationMs",
]

RUNTIME_REGRESSION_CASES = {
    "normal": ([1.0817, 0.9236, 0.0030, 0.0029, 0.0413, 0.2821, 3120], "normal"),
    "run": ([1.7948, 0.3953, 0.2383, 0.2386, 0.3337, 0.0, 3440], "normal"),
    "shake": ([3.4073, 0.6901, 0.2121, 0.1027, 0.3444, 0.0465, 3440], "normal"),
    "fall": ([3.6042, 0.2032, 0.1556, 0.0, 0.8204, 0.6383, 3760], "fall"),
    "immobility": ([1.0015, 0.9907, 0.0, 0.0, 0.0105, 1.0, 4400], "immobility"),
}


def uniform(rng: random.Random, low: float, high: float) -> float:
    return rng.uniform(low, high)


def synthetic_rows(seed: int = 20260724) -> tuple[np.ndarray, np.ndarray]:
    """Generate feature-level demo data, including hard negative movements."""

    rng = random.Random(seed)
    rows: list[list[float]] = []
    labels: list[str] = []

    # Walking, running, sitting down and other everyday motion.
    for _ in range(700):
        peak = uniform(rng, 1.05, 2.35)
        minimum = uniform(rng, 0.55, 1.0)
        motion_variance = uniform(rng, 0.018, 0.38)
        rows.append(
            [
                peak,
                minimum,
                motion_variance,
                uniform(rng, 0.012, 0.22),
                uniform(rng, 0.01, 0.38),
                uniform(rng, 0.08, 0.76),
                uniform(rng, 1800, 5200),
            ]
        )
        labels.append("normal")

    # Hard negatives: a high peak alone must not become a fall.
    for _ in range(260):
        rows.append(
            [
                uniform(rng, 2.5, 4.3),
                uniform(rng, 0.42, 0.95),
                uniform(rng, 0.12, 0.65),
                uniform(rng, 0.055, 0.42),
                uniform(rng, 0.02, 0.55),
                uniform(rng, 0.05, 0.68),
                uniform(rng, 2200, 4800),
            ]
        )
        labels.append("normal")

    # Running may contain a low minimum acceleration but lacks a large impact.
    for _ in range(220):
        rows.append(
            [
                uniform(rng, 1.45, 2.42),
                uniform(rng, 0.24, 0.62),
                uniform(rng, 0.10, 0.42),
                uniform(rng, 0.08, 0.38),
                uniform(rng, 0.15, 0.46),
                uniform(rng, 0.0, 0.24),
                uniform(rng, 2400, 5200),
            ]
        )
        labels.append("normal")

    # Regression anchor for the built-in "violent shake" replay scenario.
    for _ in range(160):
        rows.append(
            [
                uniform(rng, 3.0, 3.85),
                uniform(rng, 0.58, 0.82),
                uniform(rng, 0.17, 0.28),
                uniform(rng, 0.085, 0.16),
                uniform(rng, 0.31, 0.39),
                uniform(rng, 0.01, 0.11),
                uniform(rng, 3000, 4000),
            ]
        )
        labels.append("normal")

    # Quiet everyday states deliberately overlap with the immobility class.
    for _ in range(160):
        rows.append(
            [
                uniform(rng, 0.98, 1.42),
                uniform(rng, 0.84, 1.02),
                uniform(rng, 0.002, 0.045),
                uniform(rng, 0.0005, 0.025),
                uniform(rng, 0.0, 0.31),
                uniform(rng, 0.68, 0.84),
                uniform(rng, 2200, 3300),
            ]
        )
        labels.append("normal")

    # Fall-like combination: free fall, impact, orientation change and quiet tail.
    for _ in range(420):
        rows.append(
            [
                uniform(rng, 2.55, 4.5),
                uniform(rng, 0.08, 0.74),
                uniform(rng, 0.06, 0.48),
                uniform(rng, 0.0005, 0.075),
                uniform(rng, 0.34, 1.12),
                uniform(rng, 0.35, 0.94),
                uniform(rng, 2600, 5600),
            ]
        )
        labels.append("fall")

    # Sustained low activity without an impact.
    for _ in range(420):
        rows.append(
            [
                uniform(rng, 0.97, 1.25),
                uniform(rng, 0.89, 1.02),
                uniform(rng, 0.00001, 0.03),
                uniform(rng, 0.000001, 0.008),
                uniform(rng, 0.0, 0.22),
                uniform(rng, 0.82, 0.995),
                uniform(rng, 3300, 9000),
            ]
        )
        labels.append("immobility")

    return np.asarray(rows, dtype=float), np.asarray(labels)


def csv_rows(path: Path) -> tuple[np.ndarray, np.ndarray]:
    rows: list[list[float]] = []
    labels: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [name for name in [*FEATURE_NAMES, "label"] if name not in reader.fieldnames]
        if missing:
            raise ValueError(f"CSV missing columns: {', '.join(missing)}")
        for row in reader:
            rows.append([float(row[name]) for name in FEATURE_NAMES])
            labels.append(row["label"].strip())
    return np.asarray(rows, dtype=float), np.asarray(labels)


def js_number(value: float) -> str:
    return f"{value:.8g}"


def export_tree(model: DecisionTreeClassifier, output: Path) -> None:
    tree = model.tree_
    class_names = [str(value) for value in model.classes_]

    def emit_node(node: int, indent: str = "  ") -> Iterable[str]:
        feature_index = tree.feature[node]
        if feature_index < 0:
            counts = tree.value[node][0]
            best = int(np.argmax(counts))
            confidence = float(counts[best] / max(np.sum(counts), 1.0))
            yield f'{indent}return {{label: "{class_names[best]}", confidence: {js_number(confidence)}}}'
            return

        threshold = float(tree.threshold[node])
        yield f"{indent}if (features[{feature_index}] <= {js_number(threshold)}) {{"
        yield from emit_node(tree.children_left[node], indent + "  ")
        yield f"{indent}}} else {{"
        yield from emit_node(tree.children_right[node], indent + "  ")
        yield f"{indent}}}"

    lines = [
        "// Generated by model-training/train_and_export.py. Do not edit by hand.",
        "// Feature order: " + ", ".join(FEATURE_NAMES),
        "",
        "export const MODEL_META = {",
        '  name: "VelaGuardDecisionTree",',
        '  version: "1.0.0",',
        f"  maxDepth: {model.get_depth()},",
        "  classes: [" + ", ".join(f'"{name}"' for name in class_names) + "],",
        f"  featureCount: {len(FEATURE_NAMES)}",
        "}",
        "",
        "export function predict(features) {",
        *emit_node(0),
        "}",
        "",
    ]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--synthetic-only", action="store_true")
    args = parser.parse_args()

    if args.csv.exists() and not args.synthetic_only:
        csv_features, csv_labels = csv_rows(args.csv)
        generated_features, generated_labels = synthetic_rows()
        features = np.concatenate([generated_features, csv_features], axis=0)
        labels = np.concatenate([generated_labels, csv_labels], axis=0)
        source = f"{args.csv} + deterministic synthetic feature generator"
    else:
        features, labels = synthetic_rows()
        source = "deterministic synthetic feature generator"

    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.25,
        random_state=42,
        stratify=labels,
    )
    model = DecisionTreeClassifier(
        max_depth=4,
        min_samples_leaf=10,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    print(f"dataset: {source}")
    print(f"rows: {len(features)}, depth: {model.get_depth()}, leaves: {model.get_n_leaves()}")
    print(classification_report(y_test, predictions, digits=4))
    print("confusion matrix:")
    print(confusion_matrix(y_test, predictions, labels=model.classes_))

    print("runtime scenario regression:")
    for scenario_name, (vector, expected) in RUNTIME_REGRESSION_CASES.items():
        actual = str(model.predict(np.asarray([vector], dtype=float))[0])
        print(f"  {scenario_name:12s} -> {actual}")
        if actual != expected:
            raise RuntimeError(
                f"runtime scenario {scenario_name!r} expected {expected!r}, got {actual!r}"
            )

    export_tree(model, args.output.resolve())
    print(f"exported: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
