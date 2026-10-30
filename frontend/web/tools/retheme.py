#!/usr/bin/env python3
"""One-off retheme: teal/ocean palette -> Jet Black / Royal Amethyst / Electric Cyan.

Remaps colours by role (surface, accent, text) using HSL. Warm hues (amber, orange, red) are kept because they carry meaning
(heat, warnings, fires). Usage: retheme.py preview | retheme.py apply
"""
import colorsys, re, sys, pathlib

AMETHYST_H = 268 / 360
CYAN_H = 186.1 / 360   # #00E5FF
SRC = pathlib.Path(__file__).resolve().parent.parent / "src"


def lum(r, g, b):
    v = [x / 255 for x in (r, g, b)]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]


def match_luminance(h, s, target, l0):
    lo, hi = 0.0, 1.0
    for _ in range(30):
        mid = (lo + hi) / 2
        rr, gg, bb = colorsys.hls_to_rgb(h, mid, s)
        if lum(rr * 255, gg * 255, bb * 255) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def remap(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    hd = h * 360
    if s < 0.06 or hd <= 70 or hd >= 330:          # neutral, or warm semantic colour: keep
        return r, g, b
    if l < 0.085:                                  # page / deepest surface -> pure jet black #050505
        return 5, 5, 5
    if l < 0.22:                                   # panel surface -> near-black with a faint amethyst tint
        h2, s2, l2 = AMETHYST_H, 0.40, l * 0.55
    elif s >= 0.35:                                # accent
        if l < 0.45:                               # deep fill or glow -> royal amethyst (#3B0A6B family)
            h2, s2, l2 = AMETHYST_H, min(0.8, s + 0.15), l * 0.85
        elif hd <= 205:                            # green / teal / cyan accent -> electric cyan #00E5FF
            h2, s2, l2 = CYAN_H, 1.0, min(0.75, max(0.5, 0.5 + (l - 0.66) * 0.6))
        else:                                      # blue accent -> light amethyst
            h2, s2, l2 = AMETHYST_H, min(0.8, s), min(0.85, l + 0.02)
    else:                                          # muted text, lines, light fills -> lavender grey
        h2, s2 = AMETHYST_H, min(0.2, s * 1.2 + 0.02)
        l2 = match_luminance(h2, s2, lum(r, g, b), l)   # keep the original brightness so small text stays readable
    r2, g2, b2 = colorsys.hls_to_rgb(h2, l2, s2)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)


def hexc(r, g, b):
    return f"#{r:02x}{g:02x}{b:02x}"


HEX = re.compile(r"#([0-9a-fA-F]{6})\b")
HEX0X = re.compile(r"0x([0-9a-fA-F]{6})\b")
RGBA = re.compile(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)")


def convert(text, css):
    def f_hex(m):
        v = m.group(1); r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
        return hexc(*remap(r, g, b))

    def f_0x(m):
        v = m.group(1); r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
        return "0x" + hexc(*remap(r, g, b))[1:]

    def f_rgba(m):
        r, g, b = remap(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        return m.group(0).split("(")[0] + f"({r}, {g}, {b}"

    text = HEX.sub(f_hex, text)
    text = HEX0X.sub(f_0x, text)
    if css or True:
        text = RGBA.sub(f_rgba, text)
    return text


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if mode == "preview":
        for c in ["#07141b", "#0d2029", "#102832", "#142b33", "#28404a", "#29434e", "#9db0b1", "#e3efee", "#68868c", "#69d9c6", "#63d4c7",
                  "#65e2d0", "#8cb7ef", "#b2a5e9", "#eab16e", "#ec8b74", "#04201c", "#1c8b91", "#7e969d", "#10232c"]:
            v = c[1:]; r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
            print(c, "->", hexc(*remap(r, g, b)))
        for t in ["rgba(105,217,198,.1)", "rgba(26,83,88,.18)", "rgba(129,174,182,.16)", "rgba(3,18,24,.32)", "rgba(112,198,153,.5)", "rgba(232,177,108,.1)"]:
            print(t, "->", convert(t, True))
    else:
        for p in list(SRC.rglob("*.tsx")) + list(SRC.rglob("*.ts")) + [SRC / "styles.css", SRC.parent / "index.html"]:
            if p.name == "vite-env.d.ts" or not p.exists():
                continue
            old = p.read_text(encoding="utf-8")
            new = convert(old, p.suffix == ".css")
            if new != old:
                p.write_text(new, encoding="utf-8"); print("updated", p.relative_to(SRC.parent))
