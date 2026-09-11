# STATIC_ANALYSIS.md — HOST_SPRINT_2

**Date:** 2026-08-02  

## cppcheck (required)

| Environment | Result |
|-------------|--------|
| Local Windows | **NOT RUN** — winget MSI install cancelled (exit 1602; interactive/elevation) |
| CI (Ubuntu) | Configured in `.github/workflows/host-tests.yml` with `--enable=warning,performance --error-exitcode=1` |

No fabricated cppcheck clean bill on this workstation.

## clang-tidy (recommended)

| Scope | Result |
|-------|--------|
| AMP `replay`/`validate`/`parser`/`queue` + bus mock | Ran via llvm-mingw `clang-tidy` |
| Real logic defects fixed this sprint | Replay too-old seq accept (**fixed**; regression in tests) |
| Noise ignored (not chased) | `memset`/`memcpy` “insecureAPI” / literal suffix style |

`.clang-tidy` updated to exclude `DeprecatedOrUnsafeBufferHandling` (not actionable on freestanding/embedded C11 without Annex K).

Raw local tidy log: [`clang_tidy_raw.txt`](clang_tidy_raw.txt) (includes noise before config tighten).

## Defects fixed

| Finding | Severity | Action |
|---------|----------|--------|
| Replay accepts seq older than window | **Real bug** | Fixed in `replay.c`; regression test added |
| clang-analyzer memset_s suggestions | Style/noise | Suppressed in `.clang-tidy`; not changed |

## Pass / Fail

| Check | Status |
|-------|--------|
| Real defects addressed | **PASS** |
| Local cppcheck report | **NOT RUN** (CI gate) |
| clang-tidy (logic-focused) | **PASS** with noted suppressions |
