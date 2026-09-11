import serial
import time
import sys
import re

def capture(path, seconds=22):
    ser = serial.Serial("COM5", 115200, timeout=0.2)
    ser.setDTR(False)
    ser.setRTS(True)
    time.sleep(0.15)
    ser.setRTS(False)
    time.sleep(0.05)
    ser.reset_input_buffer()
    end = time.time() + seconds
    chunks = []
    while time.time() < end:
        data = ser.read(4096)
        if data:
            t = data.decode("utf-8", errors="replace")
            sys.stdout.write(t)
            sys.stdout.flush()
            chunks.append(t)
    ser.close()
    text = "".join(chunks)
    with open(path, "w", encoding="utf-8", errors="replace") as f:
        f.write(text)
    return text

def markers(text):
    keys = [
        "Partition Table",
        "Calling app_main",
        "AEIOS Sentinel boot",
        "NVS flash OK",
        "BSP OK",
        "HAL OK",
        "logging service ready",
        "SERVICES OK",
        "watchdog driver init",
        "rtc driver init",
        "DRIVERS init OK",
        "SELF-TEST OK",
        "starting FreeRTOS tasks",
        "Boot complete",
        "config loaded",
        "Returned from app_main",
    ]
    found = {k: (k in text) for k in keys}
    m = re.search(r"reset_reason=(\d+)", text)
    found["reset_reason_val"] = m.group(1) if m else None
    m = re.search(r"config loaded node=(\d+) gw=(\d+) sample=(\d+)s hb=(\d+)s", text)
    found["cfg"] = m.group(0) if m else None
    return found

base = r"C:/Users/Hp/OneDrive/Desktop/AEIOS/docs/evidence/D1_RUNTIME"
print("=== BOOT A ===", flush=True)
a = capture(base + "/boot_A.txt", 20)
fa = markers(a)
print("\nMARKERS_A", fa, flush=True)
time.sleep(1)
print("\n=== BOOT B ===", flush=True)
b = capture(base + "/boot_B.txt", 20)
fb = markers(b)
print("\nMARKERS_B", fb, flush=True)

skip = {"reset_reason_val"}
same = all(fa[k] == fb[k] for k in fa if k not in skip)
print("FUNCTIONAL_IDENTITY=", same)
print("CFG_A=", fa.get("cfg"))
print("CFG_B=", fb.get("cfg"))
print("RESET_A=", fa.get("reset_reason_val"), "RESET_B=", fb.get("reset_reason_val"))
sys.exit(0 if same and fa.get("cfg") and fa.get("cfg") == fb.get("cfg") else 1)
