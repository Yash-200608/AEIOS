#!/usr/bin/env python3
"""LoRa gateway receiver for Raspberry Pi 5.
SX1278 on SPI0: NSS=CE0(GPIO8) SCK=GPIO11 MISO=GPIO9 MOSI=GPIO10 RST=GPIO25 DIO0=GPIO24.
Settings match the nodes: 433.0 MHz, BW125, SF7, CR4/5, sync word 0x12, CRC on.
Packet format from the nodes (comma separated):
  node,boot,time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mV[,lat,lon,fix,sats]
Every packet is stored in SQLite (gateway.db) via gwdb.py. No ACK is sent yet.
"""
import time, sys, re
import spidev, gpiod
from gpiod.line import Direction, Value
import gwdb

RST_PIN, DIO0_PIN = 25, 24
FREQ_MHZ = 433.0

REG_FIFO, REG_OPMODE, REG_FRF_MSB = 0x00, 0x01, 0x06
REG_FIFO_ADDR_PTR, REG_FIFO_RX_CURRENT = 0x0D, 0x10
REG_IRQ_FLAGS, REG_RX_NB_BYTES = 0x12, 0x13
REG_PKT_SNR, REG_PKT_RSSI = 0x19, 0x1A
REG_MODEM_CFG1, REG_MODEM_CFG2, REG_MODEM_CFG3 = 0x1D, 0x1E, 0x26
REG_SYNC_WORD, REG_VERSION, REG_DIO_MAP1 = 0x39, 0x42, 0x40
REG_FIFO_RX_BASE, REG_HOP_CHANNEL = 0x0F, 0x1C
IRQ_RX_DONE, IRQ_CRC_ERR, CRC_ON_PAYLOAD = 0x40, 0x20, 0x40

spi = spidev.SpiDev(); spi.open(0, 0); spi.max_speed_hz = 1_000_000; spi.mode = 0

def rd(r): return spi.xfer2([r & 0x7F, 0])[1]
def wr(r, v): spi.xfer2([r | 0x80, v])

_rst = None   # kept for the life of the process: a released line floats, and GPIO25's default pull-down can hold the radio in reset

def init_radio():
    global _rst
    if _rst is None:
        _rst = gpiod.request_lines("/dev/gpiochip4", consumer="lora",
            config={RST_PIN: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.ACTIVE)})
    _rst.set_value(RST_PIN, Value.INACTIVE); time.sleep(0.01)
    _rst.set_value(RST_PIN, Value.ACTIVE); time.sleep(0.02)
    v = rd(REG_VERSION)
    if v != 0x12:
        raise RuntimeError(f"LoRa chip not found (RegVersion=0x{v:02X}, expected 0x12). Check wiring and that SPI is enabled.")
    wr(REG_OPMODE, 0x88); wr(REG_OPMODE, 0x88)           # LoRa mode, low-frequency port (433 MHz), sleep
    wr(REG_OPMODE, 0x89)                                 # standby while configuring (sleep -> RX directly missed packets)
    frf = int(FREQ_MHZ * 1e6 / (32e6 / 2**19))
    wr(REG_FRF_MSB, frf >> 16); wr(REG_FRF_MSB + 1, (frf >> 8) & 0xFF); wr(REG_FRF_MSB + 2, frf & 0xFF)
    wr(REG_MODEM_CFG1, 0x72)   # BW125, CR4/5, explicit header
    wr(REG_MODEM_CFG2, 0x74)   # SF7, CRC on
    wr(REG_MODEM_CFG3, 0x04)   # AGC auto
    wr(REG_SYNC_WORD, 0x12)
    wr(0x0C, 0x23)             # RegLna: maximum gain
    wr(REG_FIFO_RX_BASE, 0x00); wr(REG_FIFO_ADDR_PTR, 0x00)
    wr(REG_IRQ_FLAGS, 0xFF)
    wr(REG_OPMODE, 0x8D)       # continuous receive
    print(f"LoRa ready: {FREQ_MHZ} MHz, SF7, BW125, sync 0x12 (RegVersion 0x{v:02X})", flush=True)

db = gwdb.connect()

def valid_packet(raw):
    """A packet passes the radio CRC but noise can still flip bits. Accept only the node format:
    N<digits>,boot,time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mV[,lat,lon,fix,sats], printable ASCII."""
    if not (raw.isascii() and raw.isprintable()):
        return False
    f = raw.strip().split(",")
    if len(f) < 11 or not re.fullmatch(r"N\d{1,2}", f[0]) or len(f[2]) < 10:
        return False
    try:
        int(f[1]); [float(x) for x in f[3:11]]
    except ValueError:
        return False
    return True

def store(raw, rssi, snr):
    if not valid_packet(raw):
        print(f"{time.strftime('%H:%M:%S')}  packet dropped: malformed ({raw[:40]!r})", flush=True)
        return
    gwdb.store(db, raw, rssi, snr, "lora")

def main():
    try: init_radio()
    except RuntimeError as e: sys.exit(str(e))
    checked = time.time()
    while True:
        if time.time() - checked >= 10:                     # watchdog: a reset radio silently stops receiving
            checked = time.time(); m = rd(REG_OPMODE)
            if m != 0x8D:
                print(f"{time.strftime('%H:%M:%S')}  radio found in mode 0x{m:02X} (reset or power dip), configuring it again", flush=True)
                try: init_radio()
                except RuntimeError as e: print(f"{time.strftime('%H:%M:%S')}  {e} Retrying in 10 s.", flush=True)
                continue
        fl = rd(REG_IRQ_FLAGS)
        if fl & IRQ_RX_DONE:
            wr(REG_IRQ_FLAGS, 0xFF)
            if fl & IRQ_CRC_ERR:
                print("packet dropped: CRC error", flush=True); continue
            if not rd(REG_HOP_CHANNEL) & CRC_ON_PAYLOAD:       # the nodes always send a CRC; noise can decode a header without one
                print(f"{time.strftime('%H:%M:%S')}  packet dropped: no CRC (radio noise)", flush=True); continue
            n = rd(REG_RX_NB_BYTES); wr(REG_FIFO_ADDR_PTR, rd(REG_FIFO_RX_CURRENT))
            data = bytes(spi.xfer2([REG_FIFO] + [0] * n)[1:])
            snr = (rd(REG_PKT_SNR) if rd(REG_PKT_SNR) < 128 else rd(REG_PKT_SNR) - 256) / 4.0
            rssi = -164 + rd(REG_PKT_RSSI)                  # low-frequency port offset (datasheet 5.5.5)
            raw = data.decode("ascii", errors="replace")
            print(f"{time.strftime('%H:%M:%S')}  RSSI {rssi} dBm  SNR {snr:.1f} dB  {raw}", flush=True)
            store(raw, rssi, snr)
        time.sleep(0.01)

if __name__ == "__main__":
    main()
