#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 [data_dir] <backup_file>" >&2
  echo "   or: $0 <backup_file>" >&2
  exit 1
fi

# Backward-compatible form: restore.sh <data_dir> <backup_file>
if [ "$#" -ge 2 ]; then
  DATA_DIR=$1
  DB_PATH="$DATA_DIR/app.db"
  export DATA_DIR DB_PATH
  shift
fi

exec node "$SCRIPT_DIR/restore.mjs" "$@"
