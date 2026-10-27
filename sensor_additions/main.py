"""
IWOS mobile weather station - main loop.

Reads temperature/humidity/pressure (BME280), wind speed (anemometer),
and GPS position, timestamps the reading using the Pi's system clock,
logs it locally to CSV, and publishes it to the cloud over MQTT, on a
fixed interval defined in config.py.

Run with:
    python3 main.py
Stop with Ctrl+C.
"""

import time
import datetime
import traceback
from utils.status_led import StatusLED

from config import READING_INTERVAL_SECONDS

from sensors.bme280_sensor import TempHumidityPressureSensor
from sensors.anemometer import Anemometer
from sensors.gps_reader import GPSReader

from utils.data_logger import DataLogger
from utils.mqtt_publisher import MQTTPublisher


def collect_reading(temp_sensor, anemometer, gps):
    """Reads every sensor and merges the results into one dict."""
    reading = {}

    reading.update(temp_sensor.read())    # temperature_c, humidity_pct, pressure_hpa, altitude_m
    reading.update(anemometer.read())     # wind_speed_ms (blocks for WIND_SAMPLE_SECONDS)
    reading.update(gps.read())            # latitude, longitude

    # Timestamp the completed sample in UTC; never depend on the PC timezone.
    reading["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return reading


def main():
    print("Initialising sensors...")
    temp_sensor = TempHumidityPressureSensor()
    anemometer = Anemometer()
    gps = GPSReader()

    logger = DataLogger()
    publisher = MQTTPublisher()
    status_led = StatusLED()
    status_led.start()

    print(f"Station running. Taking a reading every {READING_INTERVAL_SECONDS}s. Ctrl+C to stop.")

    try:
        while True:
            loop_start = time.time()

            try:
                reading = collect_reading(temp_sensor, anemometer, gps)
                logger.log(reading)
                published = publisher.publish(reading)
                print(reading, "| published:", published)

            except Exception:
                # Don't let one bad sensor read crash the whole station -
                # log the error and keep going to the next cycle. (DHT22
                # sensors in particular fail to read cleanly fairly often -
                # that's normal, not a hardware fault.)
                print("Error during reading cycle:")
                traceback.print_exc()

            elapsed = time.time() - loop_start
            sleep_time = max(0, READING_INTERVAL_SECONDS - elapsed)
            time.sleep(sleep_time)

    except KeyboardInterrupt:
        print("\nStopping station...")

    finally:
        anemometer.cleanup()
        gps.close()
        publisher.close()
        status_led.cleanup()


if __name__ == "__main__":
    main()
