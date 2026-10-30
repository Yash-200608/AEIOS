#!/usr/bin/env python3
"""Receive-only LoRa diagnostic: same settings as the nodes; logs peak RSSI per second, IRQ events and packets."""
import time, sys, spidev, gpiod
from gpiod.line import Direction, Value
spi = spidev.SpiDev(); spi.open(0, 0); spi.max_speed_hz = 1_000_000; spi.mode = 0
rd = lambda r: spi.xfer2([r & 0x7F, 0])[1]
def wr(r, v): spi.xfer2([r | 0x80, v])
req = gpiod.request_lines("/dev/gpiochip0", consumer="lora-diag", config={25: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.ACTIVE)})
req.set_value(25, Value.INACTIVE); time.sleep(0.01); req.set_value(25, Value.ACTIVE); time.sleep(0.02)
print("version 0x%02X" % rd(0x42))
wr(0x01, 0x88); wr(0x01, 0x88); wr(0x01, 0x89)          # LoRa, low-frequency port, sleep then standby
frf = int(433.0e6 / (32e6 / 2**19)); wr(0x06, frf >> 16); wr(0x07, (frf >> 8) & 0xFF); wr(0x08, frf & 0xFF)
wr(0x1D, 0x72); wr(0x1E, 0x74); wr(0x26, 0x04); wr(0x39, 0x12); wr(0x0C, 0x23); wr(0x0F, 0); wr(0x0D, 0)
wr(0x12, 0xFF); wr(0x01, 0x8D)                           # RX continuous
time.sleep(0.05)
print("opmode 0x%02X frf %02X%02X%02X cfg1 0x%02X cfg2 0x%02X sync 0x%02X lna 0x%02X" % tuple(rd(r) for r in (0x01, 0x06, 0x07, 0x08, 0x1D, 0x1E, 0x39, 0x0C)), flush=True)
end = time.time() + float(sys.argv[1]); sec = int(time.time()); peak = -999; seen = set()
while time.time() < end:
    rssi = -164 + rd(0x1B); peak = max(peak, rssi)
    fl = rd(0x12)
    if fl:
        names = [n for b, n in ((0x80, "RxTimeout"), (0x40, "RxDone"), (0x20, "CRCerror"), (0x10, "ValidHeader"), (0x08, "TxDone"), (0x04, "CadDone"), (0x02, "FhssChange"), (0x01, "CadDetected")) if fl & b]
        msg = time.strftime("%H:%M:%S") + "  IRQ " + ",".join(names)
        if fl & 0x40:
            n = rd(0x13); wr(0x0D, rd(0x10)); data = bytes(spi.xfer2([0x00] + [0] * n)[1:])
            snr = (rd(0x19) - 256 if rd(0x19) > 127 else rd(0x19)) / 4
            msg += f"  {n} bytes  pkt RSSI {-164 + rd(0x1A)} dBm  SNR {snr} dB  {data.decode('ascii', 'replace')!r}"
            wr(0x12, 0xFF)
        elif fl & 0x10 and "hdr" not in seen:
            seen.add("hdr"); msg += "  (header seen, waiting for end of packet)"
        if not (fl & 0x10 and not fl & 0x40) or "hdrprinted" not in seen:
            print(msg, flush=True)
            if fl & 0x10 and not fl & 0x40: seen.add("hdrprinted")
        if fl & 0x40 or fl & 0x20: seen.clear()
    if int(time.time()) != sec:
        if peak > -100: print(time.strftime("%H:%M:%S") + f"  peak RSSI {peak} dBm (signal on air)", flush=True)
        sec, peak = int(time.time()), -999
    time.sleep(0.003)
print("noise floor now: %d dBm, opmode 0x%02X" % (-164 + rd(0x1B), rd(0x01)))
