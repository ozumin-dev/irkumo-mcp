#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IrkumoClient } from "./client.js";
import { createMcpServer } from "./tools.js";

async function main(): Promise<void> {
  // 鍵が無くても起動する (0.1.2)｡道具の一覧の取得 (introspection) と list_fields は鍵なしで使え､
  // 鍵が要る道具は呼ばれたときに登録の案内を返す (カタログの起動検査に通すため)｡
  const apiKey = (process.env.IRKUMO_API_KEY ?? "").trim();
  if (apiKey === "") {
    process.stderr.write(
      "環境変数 IRKUMO_API_KEY が設定されていません｡鍵が要る道具は登録の案内を返します｡無料登録: https://api.irkumo.com/account/login\n"
    );
  }

  const baseUrl = process.env.IRKUMO_API_BASE || "https://api.irkumo.com";
  const siteUrl = process.env.IRKUMO_SITE_URL || "https://irkumo.com";

  const client = new IrkumoClient({
    apiKey,
    baseUrl,
    siteUrl,
  });

  const server = createMcpServer(client);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`予期せぬエラーが発生しました: ${msg}\n`);
  process.exit(1);
});
