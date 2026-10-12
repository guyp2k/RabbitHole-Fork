#!/bin/sh
set -eu

if [ "$(id -u)" = 0 ]; then
  uid="${PUID:-1000}"
  gid="${PGID:-1000}"
  case "$uid$gid" in
    *[!0-9]*) echo "PUID and PGID must be numbers (got PUID=$uid PGID=$gid)" >&2; exit 1 ;;
  esac
  find /app/data \( ! -user "$uid" -o ! -group "$gid" \) -exec chown -h "$uid:$gid" {} +
  exec setpriv --reuid="$uid" --regid="$gid" --clear-groups -- "$@"
fi

exec "$@"
