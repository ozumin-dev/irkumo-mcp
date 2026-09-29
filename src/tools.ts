import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { IrkumoClient } from "./client.js";

/**
 * 道具の登録モジュール
 * SPEC_step4_mcp.md の 3. の表に準拠
 */
export function registerTools(server: McpServer, client: IrkumoClient): void {
  // 1. resolve_company
  server.tool(
    "resolve_company",
    "社名や別名から最上位1社を特定してコードと名前と照合情報を返します (消費クレジット: 1｡0件時は0)｡",
    {
      q: z.string().min(1).max(100).describe("検索クエリ (社名または別名)"),
    },
    async ({ q }) => {
      const res = await client.resolveCompany(q);
      return {
        isError: res.status !== 402 && !res.ok,
        content: [{ type: "text", text: res.text }],
      };
    }
  );

  // 2. search_companies
  server.tool(
    "search_companies",
    "社名や別名から会社候補の一覧を検索します (消費クレジット: 1｡0件時は0)｡属性列のみ取得可能です｡既に持っている列は要求しないようにしてください｡",
    {
      q: z.string().min(1).max(100).describe("検索クエリ (社名または別名)"),
      limit: z.number().int().min(1).max(5).optional().describe("取得件数 (1~5｡既定3)"),
      fields: z
        .string()
        .optional()
        .describe("取得する属性列 (カンマ区切り｡既定 code,name)｡属性列のみ指定可｡URL列 (ir_url, tanshin_url) は get_company を使用してください"),
      industry: z.string().optional().describe("業種による絞り込み"),
      fiscal_month: z.number().int().min(1).max(12).optional().describe("決算月 (1~12) による絞り込み"),
      prefecture: z.string().optional().describe("所在地の都道府県による絞り込み"),
      city: z.string().optional().describe("所在地の市区町村による絞り込み"),
      has_ir: z.boolean().optional().describe("IRページURLの有無による絞り込み"),
      has_tanshin: z.boolean().optional().describe("決算短信ページURLの有無による絞り込み"),
      ir_seed: z.string().optional().describe("IRページ探索の起点による絞り込み"),
    },
    async (args) => {
      const res = await client.searchCompanies(args);
      return {
        isError: res.status !== 402 && !res.ok,
        content: [{ type: "text", text: res.text }],
      };
    }
  );

  // 3. get_company
  server.tool(
    "get_company",
    "証券コードを指定して1社の詳細情報を取得します (消費クレジット: 指定した列数｡1列につき1クレジット)｡既に持っている列は要求しないようにしてください｡",
    {
      code: z.string().describe("証券コード (4桁または5桁｡例: 7203 または 72030)"),
      fields: z
        .string()
        .optional()
        .describe("取得する列 (カンマ区切り｡既定 ir_url)｡指定した列数分のクレジットを消費します"),
    },
    async ({ code, fields }) => {
      const res = await client.getCompany(code, fields);
      return {
        isError: res.status !== 402 && !res.ok,
        content: [{ type: "text", text: res.text }],
      };
    }
  );

  // 4. list_changes
  server.tool(
    "list_changes",
    "指定時点以降のデータ変更履歴を取得します (消費クレジット: 返された行数｡1行につき1クレジット)｡",
    {
      since: z.string().describe("変更の取得開始時点 (ISO 8601 時刻またはデータバージョン)"),
      limit: z.number().int().min(1).max(1000).optional().describe("取得件数 (1~1000｡既定50)"),
      column: z.string().optional().describe("特定の列名による絞り込み (例: ir_url)"),
    },
    async ({ since, limit, column }) => {
      const res = await client.listChanges({ since, limit, column });
      return {
        isError: res.status !== 402 && !res.ok,
        content: [{ type: "text", text: res.text }],
      };
    }
  );

  // 5. get_balance
  server.tool(
    "get_balance",
    "現在のクレジット残高とロットの有効期限一覧を取得します (消費クレジット: 0)｡",
    {},
    async () => {
      const res = await client.getBalance();
      return {
        isError: res.status !== 402 && !res.ok,
        content: [{ type: "text", text: res.text }],
      };
    }
  );

  // 6. list_fields
  server.tool(
    "list_fields",
    "利用可能な列の一覧と単価､データの出典情報を取得します (消費クレジット: 0)｡",
    {},
    async () => {
      const res = await client.listFields();
      return {
        isError: res.status !== 402 && !res.ok,
        content: [{ type: "text", text: res.text }],
      };
    }
  );
}

export function createMcpServer(client: IrkumoClient): McpServer {
  const server = new McpServer({
    name: "irkumo-mcp",
    version: "0.1.2",
  });
  registerTools(server, client);
  return server;
}
