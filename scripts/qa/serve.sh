#!/usr/bin/env bash
# Build and serve Gantry demos for visual QA (production builds, fixed ports).
#
#   serve.sh start [targets…]   build + serve (default: all)
#   serve.sh stop               stop every server started by this script
#   serve.sh status             list running servers
#
# Targets / ports: vanilla 4171 · react 4172 · vue 4175 · svelte 4174 · angular 4180
# (vue avoids 4173, Vite's default preview port, so a stray `vite preview` is never mistaken for it)
# (Angular routes: / roadmap · /demo · /lazy 120 tasks · /custom-bar · /examples/<case>; the demo apps
#  already built are composed under it too: /wc/ /react/ /vue/ /svelte/, as on the deployed site)
# Demos resolve @gantryjs/* from source, so no package build is needed first.
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
STATE="${TMPDIR:-/tmp}/gantry-qa-serve"
mkdir -p "$STATE"

declare -A PORT=([vanilla]=4171 [react]=4172 [vue]=4175 [svelte]=4174 [angular]=4180)
ALL=(vanilla react vue svelte angular)

pnpm_cmd() {
  # A pnpm shim can exist without a configured version (mise): test it actually runs
  if pnpm -v >/dev/null 2>&1; then pnpm "$@"; else npx -y pnpm@10.33.0 "$@"; fi
}

# Kill a process and all of its descendants (npx → sh → node vite)
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

# Safety net: whatever still listens on a port we own
kill_port() {
  local pids
  pids=$(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true)
  [[ -n $pids ]] && kill $pids 2>/dev/null || true
}

wait_for() {
  local port=$1
  for _ in $(seq 1 60); do
    curl -fs -o /dev/null "http://localhost:$port/" && return 0
    sleep 0.5
  done
  echo "  ✗ nothing answered on port $port" >&2
  return 1
}

start_one() {
  local t=$1 port=${PORT[$1]}
  if [[ -f "$STATE/$t.pid" ]] && kill -0 "$(cat "$STATE/$t.pid")" 2>/dev/null; then
    echo "• $t already running → http://localhost:$port/"
    return 0
  fi
  echo "• building $t…"
  if [[ $t == angular ]]; then
    (cd "$ROOT" && pnpm_cmd build:app >"$STATE/$t.build.log" 2>&1) || { echo "  ✗ build failed, see $STATE/$t.build.log" >&2; return 1; }
    # Like the deployed site: the demo apps already built (`start` builds them first) under /wc/ /react/ /vue/ /svelte/
    if compgen -G "$ROOT/apps/demo-*/dist/index.html" >/dev/null; then
      (cd "$ROOT" && node scripts/compose-site.mjs --allow-missing >>"$STATE/$t.build.log" 2>&1) ||
        { echo "  ✗ composing the site failed, see $STATE/$t.build.log" >&2; return 1; }
    fi
    # vite preview gives SPA fallback, so deep links like /lazy work
    (cd "$ROOT" && {
      nohup npx vite preview --outDir dist/gantry-demo/browser --port "$port" --strictPort \
        >"$STATE/$t.log" 2>&1 </dev/null &
      echo $! >"$STATE/$t.pid"
    })
  else
    (cd "$ROOT/apps/demo-$t" && npx vite build >"$STATE/$t.build.log" 2>&1) || { echo "  ✗ build failed, see $STATE/$t.build.log" >&2; return 1; }
    # Only the server goes to the background (not a subshell holding our stdout)
    (cd "$ROOT/apps/demo-$t" && {
      nohup npx vite preview --port "$port" --strictPort >"$STATE/$t.log" 2>&1 </dev/null &
      echo $! >"$STATE/$t.pid"
    })
  fi
  wait_for "$port" && echo "  ✓ $t → http://localhost:$port/"
}

case "${1:-}" in
  start)
    shift
    targets=("$@")
    [[ ${#targets[@]} -eq 0 ]] && targets=("${ALL[@]}")
    for t in "${targets[@]}"; do
      [[ -n "${PORT[$t]:-}" ]] || { echo "unknown target: $t (use: ${ALL[*]})" >&2; exit 2; }
      start_one "$t"
    done
    ;;
  stop)
    for t in "${ALL[@]}"; do
      f="$STATE/$t.pid"
      [[ -f $f ]] && kill_tree "$(cat "$f")"
      rm -f "$f"
      kill_port "${PORT[$t]}"
    done
    echo "stopped"
    ;;
  status)
    for t in "${ALL[@]}"; do
      if [[ -f "$STATE/$t.pid" ]] && kill -0 "$(cat "$STATE/$t.pid")" 2>/dev/null; then
        echo "$t → http://localhost:${PORT[$t]}/"
      fi
    done
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 2
    ;;
esac
