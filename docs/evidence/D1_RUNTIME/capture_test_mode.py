"""Capture AEIOS_TEST_MODE sequence: WDT trip + deep sleep wake."""
import serial
import time
import sys

PORT = "COM5"
BAUD = 115200
OUT = r"C:/Users/Hp/OneDrive/Desktop/AEIOS/docs/evidence/D1_RUNTIME/test_mode_uart.txt"
SECONDS = 50


def main():
    ser = serial.Serial(PORT, BAUD, timeout=0.2)
    ser.setDTR(False)
    ser.setRTS(True)
    time.sleep(0.15)
    ser.setRTS(False)
    time.sleep(0.05)
    ser.reset_input_buffer()
    end = time.time() + SECONDS
    chunks = []
    while time.time() < end:
        data = ser.read(8192)
        if data:
            t = data.decode("utf-8", errors="replace")
            sys.stdout.write(t)
            sys.stdout.flush()
            chunks.append(t)
    ser.close()
    text = "".join(chunks)
    with open(OUT, "w", encoding="utf-8", errors="replace") as f:
        f.write(text)
    checks = {
        "TEST_MODE_ACTIVE": "AEIOS_TEST_MODE ACTIVE" in text,
        "WDT_STOP_FEED": "STOPPING WDT feed" in text,
        "WDT_RECOVERY": "WDT RECOVERY OK" in text,
        "TASK_WDT": "TASK_WDT" in text,
        "DEEP_SLEEP_ENTER": "entering deep sleep" in text,
        "TIMER_WAKE": "TIMER WAKE CONFIRMED" in text,
        "SEQUENCE_COMPLETE": "sequence COMPLETE" in text,
        "MULTI_BOOT": text.count("AEIOS Sentinel boot") >= 2,
    }
    print("\n=== CHECKS ===", file=sys.stderr)
    for k, v in checks.items():
        print(f"{k}={v}", file=sys.stderr)
    ok = all(checks.values())
    print("ALL_OK=" + str(ok), file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
