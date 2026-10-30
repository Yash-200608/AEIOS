#!/usr/bin/env python3
"""Feeds fake packets (same format as the nodes send) into the gateway database. Usage: simulate.py [count] [seconds_between]"""
import random, sys, time, gwdb
count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
gap = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
db = gwdb.connect(); boot = {"N1": 0, "N2": 0}
for i in range(count):
    node = "N1" if i % 2 == 0 else "N2"; boot[node] += 1
    t = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    pkt = (f"{node},{boot[node]},{t},{random.uniform(26,33):.1f},{random.uniform(40,60):.0f},{random.uniform(985,992):.0f},"
           f"{random.uniform(20,35):.1f},{random.uniform(30,60):.0f},{random.uniform(60,120):.0f},{random.uniform(70,140):.0f},{random.uniform(300,2400):.0f},"
           f"28.6088,77.0838,1,8")
    gwdb.store(db, pkt, rssi=-60 - random.random() * 10, snr=9.5, source="simulated")
    print("stored", pkt, flush=True); time.sleep(gap)
