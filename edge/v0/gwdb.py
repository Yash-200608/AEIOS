"""Shared storage for the gateway: SQLite schema, packet parsing and insert. Used by receiver.py (LoRa), simulate.py and dashboard.py."""
import sqlite3, time, os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gateway.db")

def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS packets(
      id INTEGER PRIMARY KEY, rx_utc TEXT, raw TEXT, rssi REAL, snr REAL, source TEXT,
      node TEXT, boot INTEGER, node_time TEXT, temp REAL, rh REAL, pressure REAL, gas_kohm REAL,
      pm1 REAL, pm2_5 REAL, pm10 REAL, mq_mv REAL, lat REAL, lon REAL, fix INTEGER, sats INTEGER)""")
    return db

def _num(f, i, cast=float):
    try: return cast(f[i])
    except Exception: return None

def store(db, raw, rssi=None, snr=None, source="lora"):
    """Packet: node,boot,time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mV[,lat,lon,fix,sats]"""
    f = raw.strip().split(",")
    row = (time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()), raw, rssi, snr, source,
           f[0] if f else None, _num(f, 1, int), f[2] if len(f) > 2 else None,
           *[_num(f, i) for i in range(3, 11)], _num(f, 11), _num(f, 12), _num(f, 13, int), _num(f, 14, int))
    db.execute("INSERT INTO packets(rx_utc,raw,rssi,snr,source,node,boot,node_time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mv,lat,lon,fix,sats) "
               "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
    db.commit()
