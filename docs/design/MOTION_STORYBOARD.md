# Motion storyboard

All timings are starting values in seconds; reduced motion renders every end state at once.

## Prototype A: Mission Reveal (Motion; GSAP twin for comparison)

| t (s) | Group | Motion | Truth rule |
|---|---|---|---|
| 0 | Situation statement | already visible; no animation (useful content at first paint) | Verdict text comes from `dispersionClass()` |
| 0.08 | Currency labels | opacity 0.6 to 1 | Cached or stale labels appear with their state, never as fresh first |
| 0.18 | Assessment (column + gauges) | opacity 0 to 1, y 12 to 0, 0.42 | Gauge marks do **not** slide from 0; they render at their value |
| 0.32 | Measured air | opacity 0 to 1, y 10 to 0, 0.36 | Values never tween |
| 0.46 | Telemetry cells | stagger 0.045, opacity and y 8 | Each cell shows its own state immediately |
| 0.62 | Alerts, outlook | opacity 0 to 1, 0.32 | Ribbon appears whole; no left-to-right sweep |
| about 1.1 | done | | |

Controls: **Skip** (jumps to end state) and **Replay**. Plays once per session (`sessionStorage`). Scrolling, clicking and keyboard focus work throughout.

## Prototype B: Atmospheric Flow

- Same model fields as the Overview column (`temperature_{2,80,120,180}m`, `wind_speed/direction_{10,80,120,180}m`, `boundary_layer_height`).
- Streaks advance at `k x speed` SVG units per second (time-based), wrapping across the lane; calm (< 0.4 m/s) draws a static dash labelled calm; speeds above the drawable maximum are drawn at maximum and labelled saturated.
- Hover or focus on a height highlights its lane and announces its value; Pause button; off-screen and hidden-tab pause; static fallback.
- Caption stays: "Regional model profile (Open-Meteo), valid HH:MM. Not a vertical measurement."
- Sub-panel: 3D scene loop monitor (frames rendered per second) to demonstrate the off-screen pause.

## Prototype C: Story Scroll

Six chapters on the page in normal flow:

1. Situation · 2. Atmosphere · 3. Evidence · 4. Operations · 5. Outlook · 6. Investigate

- Motion `whileInView`, `once: true`, `amount: 0.2`, opacity and y 16; no pin, no snap, no scroll hijack.
- Optional chapter index: links that scroll natively; not sticky on phones.
- A ScrollTrigger variant (toggle) for comparison of code size, cleanup and behaviour.
- Change-signal demo: buttons switch fixtures to show (a) new packet: timestamp highlight once (0.9 s), (b) fresh to stale: label cross-fade and a text change, (c) alert raised: enters once and stays; no loop.

## Not in any prototype

Number count-ups, pulse loops, scanning beams, particle backgrounds, parallax, sound, forced intros, auto-scroll.
