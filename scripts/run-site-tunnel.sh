#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec cloudflared tunnel run --token-file "${INK_TUNNEL_TOKEN_FILE:-$project_dir/runtime/tunnel-token}"
