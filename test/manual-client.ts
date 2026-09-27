// 手動確認用 (SPEC_step4_mcp.md 4.)｡ローカルの Worker (IRKUMO_API_BASE) に対して stdio 経由で道具を呼ぶ｡
// 使い方: IRKUMO_API_KEY=... IRKUMO_API_BASE=http://127.0.0.1:8797 npx tsx test/manual-client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { ...process.env } as Record<string, string>,
  });
  const client = new Client({ name: "manual", version: "0.0.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((t) => t.name).join(", "));

  const calls: Array<[string, Record<string, unknown>]> = [
    ["get_balance", {}],
    ["resolve_company", { q: "トヨタ" }],
    ["get_company", { code: "7203" }],
    ["search_companies", { q: "ユニクロ", fields: "code,name,ir_url" }],
    ["list_fields", {}],
  ];
  for (const [name, args] of calls) {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    console.log(`\n== ${name} ${JSON.stringify(args)} isError=${String(r.isError ?? false)}\n${text.slice(0, 700)}`);
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
