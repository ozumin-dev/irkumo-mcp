#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IrkumoClient } from "./client.js";
import { createMcpServer } from "./tools.js";

async function main(): Promise<void> {
  const apiKey = process.env.IRKUMO_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    process.stderr.write("環境変数 IRKUMO_API_KEY が設定されていません｡APIキーを設定してください｡\n");
    process.exit(1);
  }

  const baseUrl = process.env.IRKUMO_API_BASE || "https://api.irkumo.com";
  const siteUrl = process.env.IRKUMO_SITE_URL || "https://irkumo.com";

  const client = new IrkumoClient({
    apiKey: apiKey.trim(),
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
