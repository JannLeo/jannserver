#!/bin/bash
DATA_DIR="${1:-./data}"
BACKUP_FILE="$2"
DB_PATH="$DATA_DIR/app.db"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 [data_dir] <backup_file>"
  echo "No backup file found at '$BACKUP_FILE'"
  exit 1
fi

cp "$BACKUP_FILE" "$DB_PATH"
echo "Restored from: $BACKUP_FILE"
