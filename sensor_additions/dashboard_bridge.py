"""Forward newly appended real weather_log.csv rows to the Node dashboard.

Run beside the original station (a separate terminal on the Raspberry Pi).
Python standard library only. No sensor drivers, generated data or GUI imports.
Existing rows are skipped on startup. Incomplete writes are retried next poll.
"""
import csv
import io
import json
import math
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

FIELDS = (
    "temperature_c", "humidity_pct", "pressure_hpa", "altitude_m",
    "wind_speed_ms", "latitude", "longitude", "irradiance_wm2", "rainfall_mmh",
)


def convert_row(row):
    reading = {"timestamp": row["timestamp"]}
    for key in FIELDS:
        raw = row.get(key)
        if raw is None or raw.strip() == "":
            reading[key] = None
        else:
            value = float(raw)
            if not math.isfinite(value):
                raise ValueError("Non-finite measurement")
            reading[key] = value
    return reading


class CsvTail:
    """Bounded incremental reader; handles partial rows, truncation and rotation."""
    def __init__(self, path):
        self.path = Path(path)
        self.identity = None
        self.offset = 0
        self.header = None
        self.first_open = True
        self.skip_partial = False

    def poll(self):
        try:
            handle = self.path.open("rb")
        except FileNotFoundError:
            return []
        with handle:
            stat = os.fstat(handle.fileno())
            identity = (stat.st_dev, stat.st_ino)
            if identity != self.identity or stat.st_size < self.offset:
                self.identity = identity
                handle.seek(0)
                header_bytes = handle.readline()
                if not header_bytes.endswith(b"\n"):
                    self.identity = None
                    return []
                self.header = next(csv.reader([header_bytes.decode("utf-8-sig").strip()]))
                if "timestamp" not in self.header:
                    raise ValueError("CSV header does not contain timestamp")
                self.offset = handle.tell()
                if self.first_open:
                    # Start at the end, even for a historical copy of the CSV.
                    self.offset = stat.st_size
                    if stat.st_size:
                        handle.seek(-1, 2)
                        self.skip_partial = handle.read(1) != b"\n"
                    self.first_open = False
                    return []
            handle.seek(self.offset)
            chunk = handle.read(65536)
            end = chunk.rfind(b"\n")
            if end < 0:
                if len(chunk) == 65536:
                    # Discard an oversized malformed row, then skip its remainder.
                    self.offset += len(chunk)
                    self.skip_partial = True
                return []
            self.offset += end + 1
            lines = chunk[:end + 1].decode("utf-8").splitlines()
            if self.skip_partial and lines:
                lines.pop(0)
                self.skip_partial = False
            readings = []
            for line in lines:
                try:
                    columns = next(csv.reader([line]))
                    if len(columns) != len(self.header):
                        raise ValueError("Incomplete CSV row")
                    readings.append(convert_row(dict(zip(self.header, columns))))
                except (ValueError, KeyError, csv.Error):
                    print("Skipped an invalid CSV row.", flush=True)
            return readings


def send_reading(url, token, reading):
    request = urllib.request.Request(
        url.rstrip("/") + "/api/telemetry/weather",
        data=json.dumps(reading, allow_nan=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)


def main():
    url = os.environ.get("DASHBOARD_URL", "")
    token = os.environ.get("SENSOR_API_TOKEN", "")
    path = os.environ.get("WEATHER_CSV_PATH", "data/weather_log.csv")
    if not url.startswith(("http://", "https://")) or not token:
        raise SystemExit("Set DASHBOARD_URL and SENSOR_API_TOKEN before starting the bridge.")
    tail = CsvTail(path)
    pending = None
    print("Bridge running. Existing rows are skipped; waiting for new sensor rows.", flush=True)
    try:
        while True:
            rows = tail.poll()
            if rows:
                # Latest reading wins during downtime; do not replay a stale backlog.
                pending = rows[-1]
            if pending:
                try:
                    result = send_reading(url, token, pending)
                    print("Sensor reading delivered:", pending["timestamp"], result, flush=True)
                    pending = None
                except urllib.error.HTTPError as error:
                    print("Dashboard returned HTTP", error.code, "— check token, source mode and sensor clock.", flush=True)
                    if error.code in (400, 409, 413, 415, 422):
                        pending = None
                except (urllib.error.URLError, TimeoutError, OSError):
                    print("Dashboard unreachable; retrying the latest reading.", flush=True)
            time.sleep(1)
    except KeyboardInterrupt:
        print("Bridge stopped.")


if __name__ == "__main__":
    main()
