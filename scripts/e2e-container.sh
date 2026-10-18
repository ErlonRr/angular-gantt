#!/usr/bin/env bash
# Run Playwright inside the official Playwright image — the same Linux, Chromium build and
# fonts as CI — so screenshot baselines match pixel for pixel whatever the host OS is.
#
#   pnpm e2e:visual                      compare against the committed baselines
#   pnpm e2e:update [playwright args…]   regenerate them (e.g. pnpm e2e:update -g dark)
#
# Needs Docker or Podman. The repository is copied into the container (without
# node_modules / dist), installed and built there; baselines and the report come back.
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
VERSION="$(node -p "require('$ROOT/node_modules/@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
ENGINE="$(command -v docker || command -v podman || true)"
[[ -n $ENGINE ]] || { echo "Docker or Podman is required" >&2; exit 2; }

# Real Docker runs as root: map the host user so the copied-back files stay yours.
# Podman (also behind the `docker` shim) runs rootless: its root already is the host user.
USER_ARGS=()
"$ENGINE" --version 2>/dev/null | grep -qi podman || USER_ARGS=(--user "$(id -u):$(id -g)")

"$ENGINE" run --rm --ipc=host "${USER_ARGS[@]}" -e HOME=/tmp -e CI=1 -e GANTRY_E2E_VISUAL=1 \
  -v "$ROOT:/src:Z" -w /tmp "$IMAGE" \
  bash -c "set -e; mkdir -p /tmp/work
    tar -C /src --exclude=./.git --exclude='*/node_modules' --exclude=./node_modules \
      --exclude='*/dist' --exclude=./dist --exclude=./test-results --exclude=./playwright-report \
      -cf - . | tar -C /tmp/work -xf -
    cd /tmp/work
    npx -y pnpm@10.33.0 install --frozen-lockfile
    npx -y pnpm@10.33.0 build
    status=0; npx playwright test $* || status=\$?
    mkdir -p /src/e2e/__screenshots__ /src/test-results/container
    cp -r e2e/__screenshots__/. /src/e2e/__screenshots__/ 2>/dev/null || true
    cp -r test-results/. /src/test-results/container/ 2>/dev/null || true
    exit \$status"
