#!/usr/bin/env bash
# Local static analysis for AMP (optional; CI enforces on Ubuntu).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AMP_SRC="$ROOT/firmware/node/components/aeios_amp/src"
AMP_INC="$ROOT/firmware/node/components/aeios_amp/include"

if command -v cppcheck >/dev/null 2>&1; then
  cppcheck --enable=warning,style,performance --error-exitcode=1 \
    --inline-suppr -I"$AMP_INC" "$AMP_SRC"
  echo "cppcheck: OK"
else
  echo "cppcheck: NOT FOUND (skip)"
fi

if command -v clang-format >/dev/null 2>&1; then
  # shellcheck disable=SC2046
  clang-format --dry-run --Werror \
    $(git -C "$ROOT" ls-files 'firmware/node/components/aeios_amp/**/*.[ch]' \
      'firmware/host_tests/*.c' 'firmware/host_mocks/**/*.[ch]')
  echo "clang-format: OK"
else
  echo "clang-format: NOT FOUND (skip)"
fi
