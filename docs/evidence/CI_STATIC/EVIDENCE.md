# Evidence: CI + Static Analysis Configuration

**Date:** 2026-08-01  

## CI

File: `.github/workflows/host-tests.yml`

| Job | Actions |
|-----|---------|
| `host-tests` | cmake configure/build, ctest, `golden_ref.py` — **fails on regression** |
| `static-analysis` | cppcheck, clang-tidy (AMP stack sources), clang-format dry-run |

## Local config

| File | Role |
|------|------|
| `.clang-format` | LLVM-based, 4-space |
| `.clang-tidy` | bugprone/performance/readability (magic numbers off) |
| `tools/run_static_analysis.sh` | Local cppcheck + format check |

## Workstation note

cppcheck/clang-tidy may be absent on Windows builder; CI on Ubuntu enforces analyzers. Host CTest evidence is captured locally (see `HOST/`).

## Pass / Fail

**PASS** — configuration delivered; analyzer execution on this workstation optional/deferred to CI runners.
