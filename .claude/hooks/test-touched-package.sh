#!/usr/bin/env bash
# PostToolUse hook (Edit|Write|MultiEdit): after a TypeScript edit in @gantry/core or
# @gantry/vanilla, run that package's unit tests (core ~1 s, vanilla ~2.5 s).
# Silent when they pass; on failure prints a short summary to stderr and exits 2, which
# Claude Code feeds back to Claude. Opt out with GANTRY_HOOK_TESTS=0.
set -uo pipefail

[[ "${GANTRY_HOOK_TESTS:-1}" == "0" ]] && exit 0

input=$(cat)
if command -v jq >/dev/null 2>&1; then
  file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
else
  file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})' <<<"$input")
fi
[[ -z "$file" || "$file" != *.ts ]] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
rel="${file#"$root"/}"
case "$rel" in
  packages/core/src/*)    project=core ;;
  packages/vanilla/src/*) project=vanilla ;;
  *) exit 0 ;;
esac

cd "$root" || exit 0
out=$(npx vitest run --project "$project" --reporter=dot 2>&1)
if [[ $? -ne 0 ]]; then
  {
    echo "Unit tests for @gantry/$project fail after editing $rel:"
    grep -E "FAIL|×|✗|Error|expected|Tests |Test Files" <<<"$out" | head -30
    echo "(Fix or continue the change; run: npx vitest run --project $project)"
  } >&2
  exit 2
fi
exit 0
