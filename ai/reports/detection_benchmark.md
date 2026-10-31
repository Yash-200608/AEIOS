# Detection benchmark (Phase 4)

_Generated 2026-10-31 19:29 UTC on Windows AMD64, Python 3.12.10._

**What this is.** Detectors tested on real CPCB hourly PM2.5 from 10 stations around Gurugram, with synthetic episodes and faults injected so there is ground truth. It measures how well each method recognises *these injected patterns*. It does **not** measure behaviour on real sensor failures, and the real series contain unlabelled genuine episodes and glitches. The AEIOS nodes have only 14 real packets, so nothing here is trained on or tells you about node data. Windows: train targets until 2025-10-01; calibration origins 2025-10-01..2026-01-16; test origins from 2026-01-16.

## 1. Pollution-event detection

Every tunable method gets one threshold, set on the calibration window (Oct 2025 to mid Jan 2026, out of sample for every model) to give 0.5 alerts per station-day on real data. An alert needs 2 consecutive flagged hours; a run alerts once, at its start, and a new run within 6 h of an alert is ignored. Recall is the share of 743 injected episodes (rise of 1.5x, 2x or 3x the local level, lasting 2 to 8 h, minimum +35 ug/m3) that raised an alert from their start to 2 h after their end. Test-window burden counts genuine unlabelled episodes too: it is workload, not a false-alarm rate.

| method | alerts per station-day (calibration) | (test) | recall | 95 % CI | 1.5x | 2x | 3x | median delay |
|---|---|---|---|---|---|---|---|---|
| robust-baseline rule | 0.50 | 0.41 | 60 % | 57 % to 64 % | 34 % | 62 % | 86 % | 1.0 h |
| Isolation Forest | 0.50 | 0.32 | 43 % | 40 % to 47 % | 15 % | 37 % | 79 % | 1.0 h |
| forecast surprise (Phase 3 model) | 0.50 | 0.50 | 66 % | 63 % to 69 % | 58 % | 59 % | 82 % | 1.0 h |
| repo EventDetector, retuned to the same burden | 0.50 | 0.20 | 28 % | 25 % to 31 % | 8 % | 20 % | 57 % | 1.0 h |
| repo EventDetector, as shipped | 0.90 | 0.90 | 60 % | 56 % to 63 % | 53 % | 61 % | 66 % | 1.0 h |

## 2. Sensor-fault classification

A Random Forest (26538 training windows) and a set of hand-written rules (thresholds tuned on separate training windows at the natural fault rate) classify each hourly window as normal, stuck, spike, sentinel (-1, no sensor frame), dropout or drift. Trained on 7 stations; tested on 3 stations never seen in training: Vikas Sadan, Gurugram - HSPCB, Dwarka-Sector 8, Delhi - DPCC, NISE Gwal Pahari, Gurugram - IMD. The shifted test draws faults from deliberately harder ranges (shorter stuck runs, weaker spikes, slower drift) than training. Rules chosen: {'stuck_run': 3, 'spike_abs': 100.0, 'spike_ratio': 3.0, 'drift_lr': 0.4}. A window is only used if the clean series is complete over its previous 24 h, so natural data gaps are never labelled faults.

### same-distribution test (8460 windows)

| class | support | RF precision | RF recall | RF F1 | rules precision | rules recall | rules F1 |
|---|---|---|---|---|---|---|---|
| normal | 6344 | 0.94 | 0.92 | 0.93 | 0.93 | 0.88 | 0.90 |
| stuck | 574 | 0.71 | 0.99 | 0.83 | 0.76 | 0.93 | 0.83 |
| spike | 80 | 0.78 | 0.93 | 0.85 | 0.78 | 0.91 | 0.84 |
| sentinel | 476 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| dropout | 430 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| drift | 556 | 0.39 | 0.33 | 0.36 | 0.22 | 0.28 | 0.24 |

Macro-F1 over fault classes: **RF 0.81**, rules 0.78. Normal windows flagged as a fault: RF 8.5 %, rules 11.7 %.

### shifted (harder) test (16920 windows)

| class | support | RF precision | RF recall | RF F1 | rules precision | rules recall | rules F1 |
|---|---|---|---|---|---|---|---|
| normal | 12039 | 0.94 | 0.91 | 0.93 | 0.91 | 0.87 | 0.89 |
| stuck | 1246 | 0.77 | 0.99 | 0.87 | 0.82 | 0.93 | 0.87 |
| spike | 158 | 0.71 | 0.92 | 0.80 | 0.76 | 0.90 | 0.82 |
| sentinel | 1098 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| dropout | 1060 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| drift | 1319 | 0.52 | 0.51 | 0.52 | 0.21 | 0.27 | 0.24 |

Macro-F1 over fault classes: **RF 0.84**, rules 0.79. Normal windows flagged as a fault: RF 8.6 %, rules 13.4 %.

### On real, un-injected data (held-out stations, test window)

1692 complete hours. Flags here are upper bounds on false alarms (real series do contain genuine glitches and plateaus): RF 2.55 per station-day {'stuck': 63, 'spike': 9, 'sentinel': 0, 'dropout': 0, 'drift': 108}; rules 2.52 per station-day {'stuck': 42, 'spike': 7, 'sentinel': 0, 'dropout': 0, 'drift': 129}. Random Forest single-window prediction: 42.2 ms on this machine, one thread.

## 3. What this means

- **Isolation Forest** is worse than the rule (43 % vs 60 %).
- **forecast surprise (Phase 3 model)** is not distinguishable from the rule on recall (66 % vs 60 %, intervals overlap), so it is not worth its complexity for event detection.
- **repo EventDetector, as shipped** reaches 60 % recall but at 0.90 alerts per station-day, against the rule's 60 % at 0.41: it does the same job with about 2.2x the alerts.
- **Fault classes:** sentinel and dropout are trivial (F1 1.00 for both methods): a one-line rule is enough. Stuck and spike are recognised by both (RF F1 0.87 and 0.80); the forest's edge is mainly fewer normal hours flagged (8.6 % vs 13.4 %). **Drift is the weak class** (RF F1 0.52, rules 0.24): gradual gain change is hard to separate from natural differences between stations 10 to 25 km apart, so it should not be trusted from PM2.5 alone at hourly resolution.
- **On real un-injected data** the forest still flags 2.6 windows per station-day (mostly drift and stuck), too noisy to drive alerts on its own.

**Decision.** None of these models is deployed. No ML event detector clearly beats the simple robust-baseline rule. For faults the forest does beat the rules overall (macro-F1 0.84 vs 0.79), and most of that gain is on drift (F1 0.52 vs 0.24), but F1 around 0.5 is not good enough to act on, and its 2.6 flags per station-day on real data would swamp anyone reading them. The deterministic QualityEngine and EventDetector therefore remain the shipped behaviour (ADR-017 fallback). What is worth porting is a cheap rule, not a model: a stuck-value check in the quality engine (the v0 adapter already maps the `-1` no-frame sentinel to a PM fault). It is not implemented here because changing the quality engine moves the golden simulation fingerprints and deserves its own change. Revisit drift when the two nodes (about 1.3 km apart) have weeks of real data: neighbour agreement is far more informative at that distance than across CPCB stations.

