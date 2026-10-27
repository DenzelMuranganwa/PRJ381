"""Bridge tests use temporary CSVs only, not sensor hardware."""
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sensor_additions'))
from dashboard_bridge import CsvTail, convert_row

HEADER='timestamp,temperature_c,humidity_pct,pressure_hpa,altitude_m,wind_speed_ms,latitude,longitude\n'
ROW='2026-09-23T12:00:00Z,20,50,900,1000,0,,\n'

class BridgeTests(unittest.TestCase):
    def test_skip_old_rows_and_read_new(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'weather.csv';p.write_text(HEADER+ROW)
            tail=CsvTail(p);self.assertEqual(tail.poll(),[])
            with p.open('a') as f:f.write(ROW)
            rows=tail.poll();self.assertEqual(len(rows),1);self.assertEqual(rows[0]['wind_speed_ms'],0)
            self.assertIsNone(rows[0]['latitude']);self.assertEqual(tail.poll(),[])
    def test_partial_row_not_forwarded_until_complete(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'weather.csv';p.write_text(HEADER);tail=CsvTail(p);tail.poll()
            with p.open('a') as f:f.write(ROW[:15])
            self.assertEqual(tail.poll(),[])
            with p.open('a') as f:f.write(ROW[15:])
            self.assertEqual(len(tail.poll()),1)
    def test_missing_file_rotation_and_malformed_row(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'weather.csv';tail=CsvTail(p);self.assertEqual(tail.poll(),[])
            p.write_text(HEADER);tail.poll();p.rename(Path(d)/'old.csv')
            p.write_text(HEADER+'bad,row\n'+ROW);self.assertEqual(len(tail.poll()),1)
    def test_blank_is_null_and_nonfinite_rejected(self):
        self.assertIsNone(convert_row({'timestamp':'t','latitude':''})['latitude'])
        with self.assertRaises(ValueError):convert_row({'timestamp':'t','temperature_c':'nan'})

if __name__=='__main__':unittest.main()
