#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"

mkdir -p "$DATA_DIR"

# The image runs the application as an unprivileged user. Bind-mounted host
# directories often arrive with a host UID/GID that the container cannot write.
# Fix ownership only when needed, then immediately drop privileges.
if ! su-exec nextjs:nodejs test -w "$DATA_DIR"; then
  chown -R nextjs:nodejs "$DATA_DIR"
fi

# Existing databases/files can still be read-only even when the directory is
# writable, so normalize app-managed data ownership before startup.
if find "$DATA_DIR" -mindepth 1 -maxdepth 1 \! -user nextjs -print -quit | grep -q .; then
  chown -R nextjs:nodejs "$DATA_DIR"
fi

exec su-exec nextjs:nodejs "$@"
