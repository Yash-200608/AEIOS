# CI_REPORT.md — HOST_SPRINT_2

**Date:** 2026-08-02  
**Workflow:** `.github/workflows/host-tests.yml`

## Pipeline

| Job | Steps | Fail on regression |
|-----|-------|--------------------|
| `host-tests` | cmake configure (`-Wall -Wextra -Werror`), build, **CTest**, Python golden | **Yes** |
| `static-analysis` | cppcheck, clang-tidy, clang-format dry-run | **Yes** (cppcheck/format) |

## Local verification (this workstation)

| Step | Result |
|------|--------|
| Host build | PASS |
| CTest 13/13 | PASS |
| Python golden | PASS |
| Fuzz 20k | PASS |
| Format / cppcheck on CI runner | Configured; not executed on this Windows host for cppcheck |

## Pass / Fail

**PASS** — CI definition complete; local host gate green.
