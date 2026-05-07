"""Download sleep-accel and DREAMT datasets from PhysioNet."""

import os
import subprocess
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

DATASETS = {
    "sleep-accel": {
        "url": "https://physionet.org/content/sleep-accel/1.0.0/",
        "dir": "sleep-accel",
    },
    "dreamt": {
        "url": "https://physionet.org/content/dreamt/2.1.0/",
        "dir": "dreamt",
    },
}


def download_dataset(name: str, url: str, target_dir: str) -> None:
    dest = os.path.join(DATA_DIR, target_dir)
    if os.path.exists(dest) and len(os.listdir(dest)) > 0:
        print(f"[skip] {name} already downloaded at {dest}")
        return

    os.makedirs(dest, exist_ok=True)
    print(f"[download] {name} from {url} → {dest}")

    try:
        subprocess.check_call(
            [
                "wget",
                "-r",
                "-N",
                "-c",
                "-np",
                "--no-host-directories",
                "--cut-dirs=3",
                "-P",
                dest,
                url,
            ],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
    except FileNotFoundError:
        print("wget not found. Install wget or download manually:")
        print(f"  Dataset: {name}")
        print(f"  URL: {url}")
        print(f"  Destination: {dest}")
        sys.exit(1)


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    for name, info in DATASETS.items():
        download_dataset(name, info["url"], info["dir"])
    print("[done] All datasets downloaded.")


if __name__ == "__main__":
    main()
