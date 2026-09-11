# STATIC_ANALYSIS.md — D1

**Date:** 2026-08-01  
**Sprint:** 1B  
**Status:** **NOT RUN**  
**Optional:** Yes (D1 Acceptance Preview)

## Objective

Run cppcheck or clang-tidy on firmware / AMP sources.

## Commands attempted

```text
winget install Cppcheck.Cppcheck   # failed / not completed (winget CLI issues)
where cppcheck                     # not found
where clang-tidy                   # not found
```

llvm-mingw provides `clang.exe` but **not** a packaged `clang-tidy` driver on PATH for this install.

## Result

Analyzers **not available** on workstation after Sprint 1B verification window.

## Warnings / Errors / Recommendations

None captured (tool absent).

## Pass / Fail

**NOT RUN** — documented N/A with reason (optional for D1; does not alone block if other evidence complete).

## Corrective action (optional follow-up)

Install Cppcheck or LLVM clang-tidy; analyze at least:

- `firmware/node/components/aeios_amp/src`
- `firmware/node/components/aeios_hal`
- `firmware/node/components/aeios_bsp`

Attach output as `static_analysis_raw.txt`.
