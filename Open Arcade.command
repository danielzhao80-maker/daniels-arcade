#!/bin/bash
# Double-click to open Daniel's Arcade.
# The arcade is served by Nullp (localhost:4173). Nullp normally starts by itself at login;
# if it isn't running, this starts it first.

URL="http://localhost:4173/games/arcade/"

if ! curl -s -m 2 -o /dev/null http://localhost:4173/api/health; then
  echo "Starting Nullp…"
  if ! launchctl kickstart "gui/$(id -u)/com.daniel.nullp" 2>/dev/null; then
    # No auto-start installed: run it in the background from the Nullp-AI folder.
    NULLP="$(cd "$(dirname "$0")/../Nullp-AI" && pwd)"
    (cd "$NULLP" && [ -d node_modules ] || npm install >/dev/null 2>&1; cd "$NULLP" && nohup node server.js >/dev/null 2>&1 &)
  fi
  for _ in $(seq 1 40); do
    curl -s -m 1 -o /dev/null http://localhost:4173/api/health && break
    sleep 0.5
  done
fi

if curl -s -m 2 -o /dev/null http://localhost:4173/api/health; then
  open "$URL"
  echo "Opened Daniel's Arcade. You can close this window."
else
  echo "Couldn't start Nullp. Open Nullp-AI/start-nullp.command, then try again."
  read -r -p "Press Enter to close…"
fi
