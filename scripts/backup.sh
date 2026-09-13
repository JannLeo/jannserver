#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Backward-compatible positional overrides:
#   ./scripts/backup.sh [data_dir] [backup_dir]
if [ "$#" -ge 1 ] && [ -n "$1" ]; then
  DATA_DIR=$1
  DB_PATH="$DATA_DIR/app.db"
  export DATA_DIR DB_PATH
  shift
fi
if [ "$#" -ge 1 ] && [ -n "$1" ]; then
  BACKUP_DIR=$1
  export BACKUP_DIR
  shift
fi

exec node "$SCRIPT_DIR/backup.mjs" "$@"
