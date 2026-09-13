#!/usr/bin/env bash
set -euo pipefail

TAILSSH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$TAILSSH_DIR/.." && pwd)"
VENV_DIR="${TAILSSH_VENV:-$ROOT_DIR/.venv_tailssh}"
PYTHON="$VENV_DIR/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "TailSSH virtualenv is missing: $VENV_DIR" >&2
  echo "Create it with:" >&2
  echo "  python3 -m venv '$VENV_DIR'" >&2
  echo "  '$VENV_DIR/bin/pip' install -r '$TAILSSH_DIR/requirements.txt'" >&2
  exit 1
fi

if [[ ! -f "${TAILSSH_CONFIG:-$TAILSSH_DIR/config.json}" ]]; then
  echo "TailSSH config is missing. Copy and edit:" >&2
  echo "  cp '$TAILSSH_DIR/config.example.json' '$TAILSSH_DIR/config.json'" >&2
  exit 1
fi

export TAILSSH_CONFIG="${TAILSSH_CONFIG:-$TAILSSH_DIR/config.json}"
exec "$PYTHON" "$TAILSSH_DIR/tailsshd.py"
