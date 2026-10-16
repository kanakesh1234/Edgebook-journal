#!/usr/bin/env bash
# Usage: scripts/visual/run.sh <command...>   — starts the harness server, runs the command, stops the server.
cd "$(dirname "$0")/../.."
PORT=${PORT:-4173}
FIXTURE=${FIXTURE:-rich} PORT=$PORT node scripts/visual/server.mjs > /tmp/harness.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null "localhost:$PORT/__test/state" && break; sleep 0.25; done
"$@"
