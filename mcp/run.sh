#!/bin/sh
# Starts the job-crm MCP server for Claude Desktop (see mcp/server.ts).
# Claude Desktop launches this with a bare PATH and an arbitrary working
# directory, so: find node, run from the repo root (for .env.local, the
# SQLite file and the @/ import paths).
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
exec node --env-file-if-exists=.env.local --import tsx mcp/server.ts
