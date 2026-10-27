"""Hardware-free checks of the sensor-side timestamp/fix patches."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]/'sensor_additions'

class GGA: pass
class RMC: pass

class FakeSerial:
    def __init__(self, lines):self.lines=iter(lines);self.timeout=2
    def readline(self):return next(self.lines,b'')
    def close(self):pass

class SensorTests(unittest.TestCase):
    def load_gps(self,messages):
        config=types.SimpleNamespace(GPS_SERIAL_PORT='/dev/test',GPS_BAUD_RATE=9600,GPS_READ_TIMEOUT_S=2)
        serial=types.SimpleNamespace(SerialException=OSError)
        parser=types.SimpleNamespace(ParseError=ValueError,parse=lambda line:messages[line],types=types.SimpleNamespace(talker=types.SimpleNamespace(GGA=GGA,RMC=RMC)))
        with patch.dict(sys.modules,{'config':config,'serial':serial,'pynmea2':parser}):
            spec=importlib.util.spec_from_file_location('patched_gps',ROOT/'gps_reader.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module
    def test_invalid_fix_ignored_and_zero_coordinates_valid(self):
        bad=RMC();bad.status='V'
        good=GGA();good.gps_qual='1';good.lat='0000.000';good.lon='00000.000';good.latitude=0;good.longitude=0
        module=self.load_gps({'$bad':bad,'$good':good});reader=module.GPSReader.__new__(module.GPSReader);reader.serial_conn=FakeSerial([b'$bad',b'$good'])
        self.assertEqual(reader.read(),{'latitude':0,'longitude':0});self.assertEqual(reader.serial_conn.timeout,2)
    def test_deadline_stops_reading_without_fix(self):
        module=self.load_gps({});reader=module.GPSReader.__new__(module.GPSReader);reader.serial_conn=FakeSerial([b'']*50)
        with patch.object(module.time,'monotonic',side_effect=[0,0.1,2.1]):
            self.assertEqual(reader.read(),{'latitude':None,'longitude':None})
        self.assertEqual(reader.serial_conn.timeout,2)
    def test_sample_timestamp_is_utc(self):
        # Extract just the actual source function to avoid loading GPIO dependencies.
        import ast,datetime
        tree=ast.parse((ROOT/'main.py').read_text());function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='collect_reading')
        scope={'datetime':datetime};exec(compile(ast.Module(body=[function],type_ignores=[]),'main.py','exec'),scope)
        sensor=types.SimpleNamespace(read=lambda:{'temperature_c':20})
        reading=scope['collect_reading'](sensor,sensor,sensor)
        self.assertTrue(reading['timestamp'].endswith('+00:00'))

if __name__=='__main__':unittest.main()
