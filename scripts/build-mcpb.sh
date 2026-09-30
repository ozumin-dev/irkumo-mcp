#!/usr/bin/env bash
# irkumo-mcp を MCPB (MCP Bundle､.mcpb) に固める｡Smithery の Local 公開と Claude Desktop の拡張として配る用｡
# 使い方 (mcp/ で): bash scripts/build-mcpb.sh
# 出力: build/irkumo-mcp-<version>.mcpb｡中身は manifest.json + server/ (dist の写し) + node_modules (本番依存だけ) + LICENSE + README.md
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./package.json').version")
OUT=build/mcpb
rm -rf "$OUT"
mkdir -p "$OUT/server"
npm run build >/dev/null
cp dist/*.js "$OUT/server/"
cp LICENSE README.md package.json package-lock.json "$OUT/"
sed "s/__VERSION__/$VER/" mcpb/manifest.json > "$OUT/manifest.json"
# 本番依存だけ入れる (postinstall 等は走らせない)
(cd "$OUT" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null 2>&1)
# バンドルに要らないもの
rm -f "$OUT/package-lock.json"
npx -y @anthropic-ai/mcpb@2.1.2 validate "$OUT/manifest.json"
npx -y @anthropic-ai/mcpb@2.1.2 pack "$OUT" "build/irkumo-mcp-$VER.mcpb"
npx -y @anthropic-ai/mcpb@2.1.2 info "build/irkumo-mcp-$VER.mcpb"
echo "[build-mcpb] build/irkumo-mcp-$VER.mcpb"
