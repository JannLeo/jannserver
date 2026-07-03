#!/bin/bash
DATA_DIR="${1:-./data}"
BACKUP_DIR="${2:-./data/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="$DATA_DIR/app.db"
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "No database found at $DB_PATH"
  exit 1
fi

# WAL checkpoint + safe backup
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/app_$TIMESTAMP.db"
echo "Backup created: $BACKUP_DIR/app_$TIMESTAMP.db"
