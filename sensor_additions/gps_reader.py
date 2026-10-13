"""GPS driver with a bounded fix wait; invalid fixes stay null."""
import time
import serial
import pynmea2
from config import GPS_SERIAL_PORT, GPS_BAUD_RATE, GPS_READ_TIMEOUT_S


class GPSReader:
    def __init__(self, port=GPS_SERIAL_PORT, baudrate=GPS_BAUD_RATE):
        self.serial_conn = serial.Serial(port, baudrate=baudrate, timeout=GPS_READ_TIMEOUT_S)

    def read(self, max_lines=50):
        # Original implementation could wait 50 * 2 seconds without a fix.
        # Bound the entire read, so weather logging can continue at its interval.
        deadline = time.monotonic() + max(0.1, GPS_READ_TIMEOUT_S)
        previous_timeout = self.serial_conn.timeout
        try:
            for _ in range(max_lines):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                self.serial_conn.timeout = min(0.25, remaining)
                try:
                    line = self.serial_conn.readline().decode("ascii", errors="replace").strip()
                except serial.SerialException:
                    break
                if not line.startswith("$"):
                    continue
                try:
                    msg = pynmea2.parse(line)
                    is_gga = isinstance(msg, pynmea2.types.talker.GGA)
                    is_rmc = isinstance(msg, pynmea2.types.talker.RMC)
                    valid = (is_gga and int(msg.gps_qual or 0) > 0) or (is_rmc and msg.status == "A")
                    if valid and msg.lat and msg.lon:
                        return {"latitude": round(msg.latitude, 6), "longitude": round(msg.longitude, 6)}
                except (pynmea2.ParseError, ValueError, AttributeError):
                    continue
        finally:
            self.serial_conn.timeout = previous_timeout
        return {"latitude": None, "longitude": None}

    def close(self):
        self.serial_conn.close()
