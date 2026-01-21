#!/usr/bin/env python3
"""
TabPFN 2.5 POC for Stride - Energy Prediction

This script validates TabPFN's suitability for predicting student energy levels.
Uses data from Stride's DuckDB database.

Prerequisites:
    pip install tabpfn duckdb pandas scikit-learn numpy

Usage:
    python scripts/tabpfn-poc.py

    # With custom database path
    DUCKDB_PATH=./data/stride.duckdb python scripts/tabpfn-poc.py

Reference: https://huggingface.co/Prior-Labs/tabpfn_2_5
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

# Check for required packages
try:
    import duckdb
except ImportError:
    print("Error: duckdb not installed. Run: pip install duckdb")
    sys.exit(1)

try:
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.metrics import accuracy_score, classification_report
except ImportError:
    print("Error: scikit-learn not installed. Run: pip install scikit-learn")
    sys.exit(1)

# TabPFN is optional - we'll mock it if not available
TABPFN_AVAILABLE = False
try:
    from tabpfn import TabPFNClassifier
    TABPFN_AVAILABLE = True
except ImportError:
    print("Warning: tabpfn not installed. Using mock classifier for demo.")
    print("Install with: pip install tabpfn")


# Configuration
DUCKDB_PATH = os.environ.get("DUCKDB_PATH", "./data/stride.duckdb")
MIN_SAMPLES = 20  # Minimum samples needed for meaningful evaluation


class MockTabPFNClassifier:
    """Mock classifier for demo when TabPFN is not installed."""

    def __init__(self):
        self.classes_ = None

    def fit(self, X, y):
        self.classes_ = np.unique(y)
        return self

    def predict(self, X):
        # Return random predictions from observed classes
        return np.random.choice(self.classes_, size=len(X))

    def predict_proba(self, X):
        n_classes = len(self.classes_)
        proba = np.random.dirichlet(np.ones(n_classes), size=len(X))
        return proba


def load_energy_data(conn: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """
    Load and prepare energy logs from DuckDB.

    Feature engineering:
    - Lag features (previous day's energy, mood, stress)
    - Rolling averages (7-day window)
    - Day of week (cyclic encoding)
    - Academic event proximity
    """
    # Check if table exists
    tables = conn.execute("SHOW TABLES").fetchall()
    table_names = [t[0] for t in tables]

    if "energy_logs" not in table_names:
        print(f"Table 'energy_logs' not found. Available tables: {table_names}")
        return pd.DataFrame()

    # Load raw data
    query = """
        SELECT
            user_id,
            log_date,
            energy_level,
            mood_score,
            stress_level,
            hours_slept,
            notes
        FROM energy_logs
        WHERE energy_level IS NOT NULL
        ORDER BY user_id, log_date
    """
    df = conn.execute(query).df()

    if df.empty:
        print("No energy_logs data found.")
        return df

    print(f"Loaded {len(df)} energy log entries from {df['user_id'].nunique()} users")

    # Feature engineering
    df = df.sort_values(["user_id", "log_date"])

    # Lag features (previous values)
    for col in ["energy_level", "mood_score", "stress_level", "hours_slept"]:
        if col in df.columns:
            df[f"{col}_lag1"] = df.groupby("user_id")[col].shift(1)
            df[f"{col}_lag7"] = df.groupby("user_id")[col].shift(7)

    # Rolling averages (7-day window)
    for col in ["energy_level", "mood_score", "stress_level"]:
        if col in df.columns:
            df[f"{col}_rolling7"] = (
                df.groupby("user_id")[col]
                .transform(lambda x: x.rolling(7, min_periods=1).mean())
            )

    # Day of week (cyclic encoding)
    df["log_date"] = pd.to_datetime(df["log_date"])
    df["day_of_week"] = df["log_date"].dt.dayofweek
    df["day_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["day_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7)

    # Drop rows with NaN in lag features (first few rows per user)
    df = df.dropna()

    return df


def load_academic_events(conn: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Load academic events for proximity features."""
    tables = conn.execute("SHOW TABLES").fetchall()
    table_names = [t[0] for t in tables]

    if "academic_events" not in table_names:
        return pd.DataFrame()

    query = """
        SELECT
            user_id,
            event_date,
            event_type,
            stress_multiplier
        FROM academic_events
        WHERE event_date >= CURRENT_DATE - INTERVAL '30 days'
    """
    return conn.execute(query).df()


def prepare_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """
    Prepare feature matrix X and target y for classification.

    Target: energy_level (1-5, discretized)
    Features: lag values, rolling averages, temporal encoding
    """
    feature_cols = [
        "mood_score",
        "stress_level",
        "hours_slept",
        "energy_level_lag1",
        "energy_level_lag7",
        "mood_score_lag1",
        "stress_level_lag1",
        "energy_level_rolling7",
        "mood_score_rolling7",
        "stress_level_rolling7",
        "day_sin",
        "day_cos",
    ]

    # Filter to available columns
    available_cols = [c for c in feature_cols if c in df.columns]

    if len(available_cols) < 3:
        print(f"Insufficient features. Available: {available_cols}")
        return np.array([]), np.array([])

    X = df[available_cols].values
    y = df["energy_level"].values

    # Discretize energy levels to integers if needed
    y = np.round(y).astype(int)

    return X, y


def evaluate_tabpfn(X: np.ndarray, y: np.ndarray) -> dict:
    """
    Evaluate TabPFN classifier on energy prediction task.

    Returns metrics dict with accuracy, cross-validation scores, etc.
    """
    if len(X) < MIN_SAMPLES:
        return {
            "error": f"Insufficient samples ({len(X)} < {MIN_SAMPLES})",
            "samples": len(X),
        }

    # Initialize classifier
    if TABPFN_AVAILABLE:
        clf = TabPFNClassifier(device="cpu")  # Use CPU for POC
        print("Using real TabPFN classifier")
    else:
        clf = MockTabPFNClassifier()
        print("Using mock classifier (TabPFN not installed)")

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"\nDataset: {len(X)} samples ({len(X_train)} train, {len(X_test)} test)")
    print(f"Features: {X.shape[1]}")
    print(f"Classes: {np.unique(y)}")

    # Fit and predict
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    # Calculate metrics
    accuracy = accuracy_score(y_test, y_pred)

    # Cross-validation (5-fold)
    cv_scores = cross_val_score(clf, X, y, cv=5, scoring="accuracy")

    results = {
        "samples": len(X),
        "features": X.shape[1],
        "classes": list(np.unique(y)),
        "accuracy": float(accuracy),
        "cv_mean": float(cv_scores.mean()),
        "cv_std": float(cv_scores.std()),
        "classification_report": classification_report(y_test, y_pred, output_dict=True),
    }

    return results


def generate_synthetic_data(n_samples: int = 200) -> pd.DataFrame:
    """
    Generate synthetic energy data for demo when no real data is available.

    Simulates realistic patterns:
    - Energy correlates with sleep
    - Stress inversely correlates with energy
    - Weekend effect (higher energy)
    """
    np.random.seed(42)

    dates = pd.date_range(start="2024-01-01", periods=n_samples, freq="D")
    day_of_week = dates.dayofweek

    # Base patterns
    hours_slept = np.random.normal(7, 1.5, n_samples).clip(4, 10)
    stress_level = np.random.uniform(1, 5, n_samples)
    mood_score = np.random.normal(3.5, 1, n_samples).clip(1, 5)

    # Energy depends on sleep, stress, day of week
    weekend_bonus = np.where(day_of_week >= 5, 0.5, 0)
    sleep_effect = (hours_slept - 7) * 0.3
    stress_effect = -(stress_level - 3) * 0.2

    energy_level = (
        3
        + sleep_effect
        + stress_effect
        + weekend_bonus
        + np.random.normal(0, 0.5, n_samples)
    )
    energy_level = np.round(energy_level).clip(1, 5).astype(int)

    df = pd.DataFrame({
        "user_id": "synthetic_user",
        "log_date": dates,
        "energy_level": energy_level,
        "mood_score": np.round(mood_score).astype(int),
        "stress_level": np.round(stress_level).astype(int),
        "hours_slept": np.round(hours_slept, 1),
        "notes": None,
    })

    # Add lag features
    for col in ["energy_level", "mood_score", "stress_level", "hours_slept"]:
        df[f"{col}_lag1"] = df[col].shift(1)
        df[f"{col}_lag7"] = df[col].shift(7)

    # Rolling averages
    for col in ["energy_level", "mood_score", "stress_level"]:
        df[f"{col}_rolling7"] = df[col].rolling(7, min_periods=1).mean()

    # Cyclic day encoding
    df["day_sin"] = np.sin(2 * np.pi * day_of_week / 7)
    df["day_cos"] = np.cos(2 * np.pi * day_of_week / 7)

    return df.dropna()


def main():
    print("=" * 60)
    print("TabPFN 2.5 POC for Stride - Energy Prediction")
    print("=" * 60)
    print()

    # Try to load real data from DuckDB
    db_path = Path(DUCKDB_PATH)
    use_synthetic = False

    if db_path.exists():
        print(f"Connecting to DuckDB: {db_path}")
        conn = duckdb.connect(str(db_path), read_only=True)

        df = load_energy_data(conn)
        conn.close()

        if df.empty or len(df) < MIN_SAMPLES:
            print(f"\nInsufficient real data. Falling back to synthetic data.")
            use_synthetic = True
    else:
        print(f"Database not found: {db_path}")
        print("Using synthetic data for demonstration.")
        use_synthetic = True

    if use_synthetic:
        df = generate_synthetic_data(n_samples=200)
        print(f"\nGenerated {len(df)} synthetic energy logs")

    # Prepare features
    X, y = prepare_features(df)

    if len(X) == 0:
        print("\nError: Could not prepare features. Exiting.")
        sys.exit(1)

    # Evaluate TabPFN
    print("\n" + "-" * 40)
    print("Evaluating TabPFN Classifier")
    print("-" * 40)

    results = evaluate_tabpfn(X, y)

    if "error" in results:
        print(f"\nError: {results['error']}")
        sys.exit(1)

    # Print results
    print(f"\n{'='*40}")
    print("RESULTS")
    print("=" * 40)
    print(f"Samples:     {results['samples']}")
    print(f"Features:    {results['features']}")
    print(f"Classes:     {results['classes']}")
    print()
    print(f"Test Accuracy:  {results['accuracy']:.2%}")
    print(f"CV Accuracy:    {results['cv_mean']:.2%} (+/- {results['cv_std']:.2%})")
    print()

    # Interpretation
    if results["cv_mean"] > 0.6:
        verdict = "PROMISING - TabPFN shows predictive power"
    elif results["cv_mean"] > 0.4:
        verdict = "MARGINAL - Some signal, needs more data/features"
    else:
        verdict = "WEAK - Consider alternative approaches"

    print(f"Verdict: {verdict}")
    print()

    # Recommendations
    print("Next steps:")
    if TABPFN_AVAILABLE:
        print("1. Collect more real energy data (target: 100+ samples)")
        print("2. Add academic event proximity features")
        print("3. Test on goal feasibility prediction")
    else:
        print("1. Install TabPFN: pip install tabpfn")
        print("2. Re-run with real classifier")
        print("3. Compare with XGBoost baseline")

    return results


if __name__ == "__main__":
    main()
