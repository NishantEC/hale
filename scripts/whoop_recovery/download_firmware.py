#!/usr/bin/env python3
"""
Download WHOOP 4.0 (HARVARD) firmware from the official WHOOP API.

Mirrors bWanShiTong/openwhoop's `download-firmware` Rust command using the
simpler /auth-service/v2/whoop/sign-in endpoint (no Cognito client ID
needed). Saves the firmware ZIP, extracts .zbin (Maxim) + .bin (Nordic)
files, and parses the .zbin header.

Usage:
  pip install requests
  python download_firmware.py --email YOU@EMAIL.COM
  # (prompts for password; or set WHOOP_PASSWORD env var)
"""

import argparse
import base64
import getpass
import io
import json
import os
import struct
import sys
import zipfile
from pathlib import Path

import requests

API_BASE = "https://api.prod.whoop.com"
SIGN_IN_URL = f"{API_BASE}/auth-service/v2/whoop/sign-in"
FW_CHECK_URL = f"{API_BASE}/firmware-service/v4/firmware/check"
FW_VERSION_URL = f"{API_BASE}/firmware-service/v4/firmware/version"

# Per bWanShiTong/openwhoop main.rs lines 393-402: Harvard uses BOTH Maxim + Nordic chips.
HARVARD_CHIPS = ["MAXIM", "NORDIC"]

# Full Android-app header set so WHOOP's Cloudflare gateway doesn't 404
# us before our request reaches the firmware-service backend. Values
# match the current Android app per chukfinley/whoopsi's downloader.
APP_HEADERS = {
    "User-Agent": "Whoop-Android/5.430.0",
    "x-whoop-app-version": "5.430.0",
    "x-whoop-app-version-code": "375528",
    "x-whoop-device-platform": "ANDROID",
    "x-whoop-package-name": "com.whoop.android",
}


def sign_in(email: str, password: str) -> str:
    """Email/password login. Returns access token."""
    print(f"Signing in as {email}…")
    resp = requests.post(
        SIGN_IN_URL,
        json={"username": email, "password": password},
        headers=APP_HEADERS,
        timeout=30,
    )
    if not resp.ok:
        print(f"  ❌ Auth failed: HTTP {resp.status_code}")
        print(f"     Response: {resp.text[:400]}")
        sys.exit(1)
    body = resp.json()
    token = body.get("access_token")
    if not token:
        print(f"  ❌ No access_token in response: {body}")
        sys.exit(1)
    expires = body.get("access_token_expires_in", "?")
    print(f"  ✓ Signed in (token expires in {expires}s)")
    return token


def check_firmware(token: str) -> dict:
    """Ask the API what firmware is available for HARVARD.

    The /check endpoint expects a BARE ARRAY of current chip firmwares as
    the top-level body (Jackson `ArrayList<ChipFirmware>`), NOT a wrapper
    object — chukfinley's old script was wrong about this.
    """
    print("\nChecking HARVARD firmware availability…")
    payload = [
        {"chip_name": chip, "version": "0.0.0.0"} for chip in HARVARD_CHIPS
    ]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        **APP_HEADERS,
    }
    resp = requests.post(
        f"{FW_CHECK_URL}?deviceName=HARVARD",
        json=payload,
        headers=headers,
        timeout=30,
    )
    if not resp.ok:
        print(f"  ❌ Check failed: HTTP {resp.status_code}")
        print(f"     Response: {resp.text[:600]}")
        sys.exit(1)
    body = resp.json()
    print(f"  ✓ Server response:")
    print(f"     {json.dumps(body, indent=2)[:1500]}")
    return body


def download_firmware(token: str, upgrade_versions: list[dict]) -> bytes:
    """Download the firmware ZIP for HARVARD."""
    print("\nDownloading HARVARD firmware…")
    payload = {
        "current_chip_firmwares": [
            {"chip_name": chip, "version": "0.0.0.0"} for chip in HARVARD_CHIPS
        ],
        "chip_firmwares_of_upgrade": upgrade_versions,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        **APP_HEADERS,
    }
    resp = requests.post(
        f"{FW_VERSION_URL}?deviceName=HARVARD",
        json=payload,
        headers=headers,
        timeout=180,
    )
    if not resp.ok:
        print(f"  ❌ Download failed: HTTP {resp.status_code}")
        print(f"     Response: {resp.text[:600]}")
        sys.exit(1)
    body = resp.json()
    b64_zip = body.get("firmware_zip_file") or body.get("firmware_file")
    if not b64_zip:
        print(f"  ❌ No firmware_zip_file in response.")
        print(f"     Body: {json.dumps(body, indent=2)[:1500]}")
        sys.exit(1)
    zip_bytes = base64.b64decode(b64_zip)
    print(f"  ✓ Got {len(zip_bytes):,} bytes of firmware ZIP")
    return zip_bytes


def extract_zip(zip_bytes: bytes, out_dir: Path) -> list[Path]:
    """Extract the firmware ZIP to out_dir. Returns list of extracted files."""
    out_dir.mkdir(parents=True, exist_ok=True)
    extracted = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            dest = out_dir / Path(name).name
            with zf.open(name) as src, open(dest, "wb") as dst:
                data = src.read()
                dst.write(data)
            extracted.append(dest)
            print(f"     extracted: {dest.name} ({len(data):,} bytes)")
    return extracted


def parse_zbin_header(data: bytes) -> dict:
    """Parse the first 512 bytes of a .zbin (Ambiq Secure OTA container)."""
    if len(data) < 512:
        return {"error": "too small for zbin header"}
    h = data[:512]
    return {
        "payload_crc32": f"0x{struct.unpack_from('<I', h, 0x000)[0]:08x}",
        "compressed_size": struct.unpack_from("<I", h, 0x004)[0],
        "image_type": struct.unpack_from("<I", h, 0x010)[0],
        "version_string": h[0x04C : 0x05C].split(b"\x00")[0].decode("ascii", errors="replace"),
        "version_major": struct.unpack_from("<I", h, 0x07C)[0],
        "version_minor": struct.unpack_from("<I", h, 0x080)[0],
        "version_patch": struct.unpack_from("<I", h, 0x084)[0],
        "build_info_raw": h[0x018:0x04C].split(b"\x00")[0].decode("ascii", errors="replace"),
    }


def load_dotenv(path: Path = Path(".env")) -> None:
    """Minimal .env loader (no external dep). Sets os.environ for lines like KEY=VAL.
    Lines starting with # are ignored. Quoted values are unquoted. Existing env
    vars are NOT overwritten (CLI flags / shell exports take precedence)."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def main():
    # Load .env from script directory if present, before parsing args.
    load_dotenv(Path(__file__).parent / ".env")

    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--email",
        default=os.environ.get("WHOOP_EMAIL"),
        help="WHOOP account email (or set WHOOP_EMAIL in env / .env)",
    )
    ap.add_argument(
        "--password",
        default=os.environ.get("WHOOP_PASSWORD"),
        help="WHOOP password (or set WHOOP_PASSWORD in env / .env, or prompt)",
    )
    ap.add_argument(
        "--out",
        default="harvard_firmware",
        help="Output directory (default: ./harvard_firmware)",
    )
    args = ap.parse_args()

    if not args.email:
        print("Error: --email required (or set WHOOP_EMAIL in .env)")
        sys.exit(2)

    password = args.password
    if not password:
        password = getpass.getpass("WHOOP password: ")

    out_dir = Path(args.out).resolve()
    print(f"Output dir: {out_dir}\n")

    # Step 1: auth
    email = args.email
    token = sign_in(email, password)

    # ── Diagnostic probes (UPDATED for Nov 2026 BFF API) ───────────
    # Per API research: WHOOP moved to BFF/aggregator pattern. Old
    # service names (`user-service`, `users-devices`, etc.) return k8s
    # default 404. Current rules:
    #   1. Append ?apiVersion=7 to EVERY URL
    #   2. Lowercase `bearer` in Authorization header (matches what app sends)
    #   3. Use plural / BFF service names: users-service, core-details-bff, etc.
    print("\n── Endpoint probing (apiVersion=7, lowercase bearer, BFF names) ──")
    auth_headers = {
        "Authorization": f"bearer {token}",  # lowercase!
        "Content-Type": "application/json",
        **APP_HEADERS,
    }
    candidates = [
        # The single best "is my token valid" probe per research:
        ("GET", "/users-service/v2/bootstrap/?apiVersion=7&accountType=users&id=0", None),
        # Current service names with apiVersion=7
        ("GET", "/membership?apiVersion=7", None),
        ("GET", "/users-service/v1/users/me?apiVersion=7", None),
        ("GET", "/home-service/v1/widget/overview?apiVersion=7", None),
        ("GET", "/users-devices-service/v1/devices?apiVersion=7", None),
        ("GET", "/devices-service/v1/devices?apiVersion=7", None),
        # Firmware path variants with apiVersion=7
        ("POST", "/firmware-service/v4/firmware/version?deviceName=HARVARD&apiVersion=7",
            {"current_chip_firmwares": [{"chip_name": c, "version": "1.0.0.0"} for c in HARVARD_CHIPS],
             "chip_firmwares_of_upgrade": [{"chip_name": c, "version": "1.0.0.0"} for c in HARVARD_CHIPS]}),
        ("POST", "/firmware-service/v5/firmware/version?deviceName=HARVARD&apiVersion=7",
            {"current_chip_firmwares": [{"chip_name": c, "version": "1.0.0.0"} for c in HARVARD_CHIPS],
             "chip_firmwares_of_upgrade": [{"chip_name": c, "version": "1.0.0.0"} for c in HARVARD_CHIPS]}),
        ("GET", "/firmware-service/v4/firmware/version?deviceName=HARVARD&apiVersion=7", None),
        # Maybe firmware moved to BFF naming too
        ("POST", "/firmware-bff/v1/firmware/version?deviceName=HARVARD&apiVersion=7",
            {"current_chip_firmwares": [{"chip_name": c, "version": "1.0.0.0"} for c in HARVARD_CHIPS],
             "chip_firmwares_of_upgrade": [{"chip_name": c, "version": "1.0.0.0"} for c in HARVARD_CHIPS]}),
        ("GET", "/ota-service/v1/firmware?deviceName=HARVARD&apiVersion=7", None),
    ]
    for method, path, body in candidates:
        url = f"{API_BASE}{path}"
        try:
            if method == "GET":
                r = requests.get(url, headers=auth_headers, timeout=15)
            else:
                r = requests.post(url, json=body, headers=auth_headers, timeout=15)
            preview = r.text[:200].replace("\n", " ")
            content_type = r.headers.get("content-type", "?")
            print(f"  [{r.status_code}] {method} {path}")
            print(f"        content-type={content_type}  body={preview!r}")
        except requests.RequestException as e:
            print(f"  [ERR] {method} {path}: {e}")
    print("── End probing ──\n")

    # Step 2: iterate over firmware download attempts. openwhoop uses
    # "1.0.0.0" for current and requires specific upgrade versions; we
    # don't know real HARVARD versions yet so we sweep common patterns.
    print("\n── Firmware download attempts ──")
    current_options = ["0.0.0.0", "1.0.0.0"]
    # Plausible Harvard firmware versions to try as upgrade targets.
    # Mix of patterns: openwhoop's default, Maverick-like, Puffin-like,
    # and very-high "latest" placeholders. Server may 404 unknown versions.
    upgrade_versions = [
        "1.0.0.0",            # openwhoop default
        "3.30.5.0",           # Puffin-known
        "4.30.0.0",           # speculative 4.x
        "999.999.999.999",    # placeholder "latest"
    ]
    user_agents = [
        "Whoop-Android/5.430.0",  # what we've been sending
        None,                     # default requests UA
        "okhttp/4.12.0",          # plain Android HTTP client
    ]
    zip_bytes = None
    for cur in current_options:
        for upver in upgrade_versions:
            for ua in user_agents:
                upgrade = [{"chip_name": c, "version": upver} for c in HARVARD_CHIPS]
                current = [{"chip_name": c, "version": cur} for c in HARVARD_CHIPS]
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "x-whoop-device-platform": "ANDROID",
                }
                if ua is not None:
                    headers["User-Agent"] = ua
                    headers["x-whoop-app-version"] = "5.430.0"
                    headers["x-whoop-app-version-code"] = "375528"
                    headers["x-whoop-package-name"] = "com.whoop.android"
                body = {
                    "current_chip_firmwares": current,
                    "chip_firmwares_of_upgrade": upgrade,
                }
                tag = f"cur={cur} upgrade={upver} ua={ua or 'default'}"
                try:
                    r = requests.post(
                        f"{FW_VERSION_URL}?deviceName=HARVARD",
                        json=body,
                        headers=headers,
                        timeout=30,
                    )
                    if r.ok:
                        rb = r.json()
                        b64 = rb.get("firmware_zip_file") or rb.get("firmware_file")
                        if b64:
                            zip_bytes = base64.b64decode(b64)
                            print(f"  ✅ HIT  {tag}  →  {len(zip_bytes):,} bytes ZIP")
                            break
                        else:
                            print(f"  [200 no-zip] {tag}  body keys: {list(rb.keys())}")
                    else:
                        body_preview = r.text[:120].replace("\n", " ")
                        print(f"  [{r.status_code}] {tag}  → {body_preview!r}")
                except requests.RequestException as e:
                    print(f"  [ERR] {tag}: {e}")
            if zip_bytes:
                break
        if zip_bytes:
            break
    print("── End attempts ──\n")

    if not zip_bytes:
        print("❌ All download attempts failed. The firmware endpoint either:")
        print("    1. requires a Gen 4 device registered on the account (subscription state)")
        print("    2. has moved to a path we haven't probed")
        print("    3. requires Cognito (v3) auth instead of v2 sign-in")
        sys.exit(1)

    # Save the raw ZIP
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / "harvard_firmware.zip"
    zip_path.write_bytes(zip_bytes)
    print(f"\n  ✓ Saved raw ZIP: {zip_path}")

    # Step 4: extract + parse
    print(f"\nExtracting firmware files…")
    extracted = extract_zip(zip_bytes, out_dir)

    print("\n── Parsed file headers ──")
    for path in extracted:
        data = path.read_bytes()
        print(f"\n  {path.name} ({len(data):,} bytes)")
        if path.suffix.lower() == ".zbin":
            for k, v in parse_zbin_header(data).items():
                print(f"    {k}: {v}")
        else:
            # .bin or other — just hex of first 32 bytes
            head = " ".join(f"{b:02x}" for b in data[:32])
            print(f"    head: {head}…")

    print(f"\n✓ Done. Files in {out_dir}")
    print(
        "\nNext step: decompress the .zbin payload (gzip-compressed ARM image starting at "
        "offset 0x200) and disassemble in Ghidra / r2 / IDA. The trim handler is the "
        "function called by cmd 0x19 (FORCE_TRIM) — look for refs to the circular buffer "
        "base address and the trim pointer state variable."
    )


if __name__ == "__main__":
    main()
