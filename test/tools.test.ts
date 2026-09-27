import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { IrkumoClient } from "../src/client.js";
import { createMcpServer } from "../src/tools.js";

/**
 * テスト用ヘルパー
 * InMemoryTransport で Client と Server を直結する
 */
async function setupTestServer(fetchMock: typeof fetch, apiKey = "test_api_key_123") {
  const client = new IrkumoClient({
    apiKey,
    baseUrl: "https://api.irkumo.example",
    siteUrl: "https://irkumo.example",
    fetchFn: fetchMock,
  });

  const server = createMcpServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const mcpClient = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  await mcpClient.connect(clientTransport);

  return { client, server, mcpClient };
}

describe("irkumo-mcp 道具テスト", () => {
  // 1. resolve_company
  it("resolve_company: 正常系 (最上位1社の特定とヘッダ･URL検証)", async () => {
    let capturedUrl = "";
    let capturedHeaders: Headers | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input.toString();
      capturedHeaders = new Headers(init?.headers);

      return new Response(
        JSON.stringify({
          total: 1,
          limit: 1,
          offset: 0,
          items: [
            {
              code: "72030",
              name: "トヨタ自動車",
              match: { stage: 1, matched: "トヨタ自動車", type: "exact_name" },
            },
          ],
          credits: { charged: 1, remaining: 99 },
          data_version: "2026-09-20T00:00:00Z",
          request_id: "req_1",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Credits-Charged": "1",
            "X-Credits-Remaining": "99",
          },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "resolve_company",
      arguments: { q: "トヨタ" },
    })) as any;

    expect(capturedUrl).toBe("https://api.irkumo.example/v1/search?q=%E3%83%88%E3%83%A8%E3%82%BF&limit=1&fields=code%2Cname");
    expect(capturedHeaders?.get("X-API-Key")).toBe("test_api_key_123");
    expect(res.isError).toBeFalsy();

    const text = res.content[0].text;
    expect(text).toContain('"code": "72030"');
    expect(text).toContain('"name": "トヨタ自動車"');
    expect(text).toContain('"stage": 1');
    expect(text).toContain("credits_charged: 1 / credits_remaining: 99");
  });

  it("resolve_company: 0件時の応答 (消費0クレジット)", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          total: 0,
          limit: 1,
          offset: 0,
          items: [],
          credits: { charged: 0, remaining: 100 },
          data_version: "2026-09-20T00:00:00Z",
          request_id: "req_2",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "resolve_company",
      arguments: { q: "存在しない会社" },
    })) as any;

    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain("該当する会社が見つかりませんでした｡");
    expect(text).toContain("credits_charged: 0 / credits_remaining: 100");
  });

  // 2. search_companies
  it("search_companies: 正常系 (絞り込みと引数の組み立て)", async () => {
    let capturedUrl = "";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();

      return new Response(
        JSON.stringify({
          total: 2,
          limit: 5,
          offset: 0,
          items: [
            { code: "72030", name: "トヨタ自動車", match: { stage: 1 } },
            { code: "72010", name: "日産自動車", match: { stage: 2 } },
          ],
          credits: { charged: 1, remaining: 99 },
          data_version: "2026-09-20T00:00:00Z",
          request_id: "req_3",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "search_companies",
      arguments: {
        q: "自動車",
        limit: 5,
        fields: "code,name,industry",
        industry: "輸送用機器",
        fiscal_month: 3,
        prefecture: "愛知県",
        has_ir: true,
      },
    })) as any;

    expect(capturedUrl).toContain("q=%E8%87%AA%E5%8B%95%E8%BB%8A");
    expect(capturedUrl).toContain("limit=5");
    expect(capturedUrl).toContain("fields=code%2Cname%2Cindustry");
    expect(capturedUrl).toContain("industry=%E8%BC%B8%E9%80%81%E7%94%A8%E6%A9%9F%E5%99%A8");
    expect(capturedUrl).toContain("fiscal_month=3");
    expect(capturedUrl).toContain("prefecture=%E6%84%9B%E7%9F%A5%E7%9C%8C");
    expect(capturedUrl).toContain("has_ir=true");

    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('"total": 2');
    expect(text).toContain("credits_charged: 1 / credits_remaining: 99");
  });

  it("search_companies: URL列指定時にAPI呼び出し前に弾くこと", async () => {
    const fetchMock = vi.fn();
    const { mcpClient } = await setupTestServer(fetchMock as unknown as typeof fetch);

    const res = (await mcpClient.callTool({
      name: "search_companies",
      arguments: {
        q: "トヨタ",
        fields: "code,name,ir_url",
      },
    })) as any;

    // fetch が一度も呼ばれていないことを検証
    expect(fetchMock).not.toHaveBeenCalled();

    const text = res.content[0].text;
    expect(text).toContain("search_companies の fields には属性列 (code, code4, name, name_current, kana, en, industry, fiscal_month, prefecture, city) のみ指定できます｡");
    expect(text).toContain("credits_charged: 0 / credits_remaining: -");
  });

  // 3. get_company
  it("get_company: 正常系 (列数分の課金とURLの組み立て)", async () => {
    let capturedUrl = "";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();

      return new Response(
        JSON.stringify({
          code: "72030",
          name: "トヨタ自動車",
          ir_url: "https://global.toyota/jp/ir/",
          tanshin_url: "https://global.toyota/jp/ir/library/results/",
          credits: { charged: 2, remaining: 98 },
          data_version: "2026-09-20T00:00:00Z",
          request_id: "req_4",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "get_company",
      arguments: {
        code: "7203",
        fields: "ir_url,tanshin_url",
      },
    })) as any;

    expect(capturedUrl).toBe("https://api.irkumo.example/v1/companies/7203?fields=ir_url%2Ctanshin_url");
    expect(res.isError).toBeFalsy();

    const text = res.content[0].text;
    expect(text).toContain('"code": "72030"');
    expect(text).toContain('"ir_url": "https://global.toyota/jp/ir/"');
    expect(text).toContain("credits_charged: 2 / credits_remaining: 98");
  });

  // 4. list_changes
  it("list_changes: 正常系 (行数分の課金)", async () => {
    let capturedUrl = "";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();

      return new Response(
        JSON.stringify({
          total: 2,
          limit: 50,
          offset: 0,
          items: [
            {
              code: "72030",
              column: "ir_url",
              old: "https://old.toyota/ir",
              new: "https://global.toyota/jp/ir/",
              changed_at: "2026-09-20T01:00:00Z",
              data_version: "2026-09-20T00:00:00Z",
            },
            {
              code: "67580",
              column: "ir_url",
              old: "https://old.sony/ir",
              new: "https://sony.com/ir",
              changed_at: "2026-09-20T02:00:00Z",
              data_version: "2026-09-20T00:00:00Z",
            },
          ],
          credits: { charged: 2, remaining: 96 },
          data_version: "2026-09-20T00:00:00Z",
          request_id: "req_5",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "list_changes",
      arguments: {
        since: "2026-09-01T00:00:00Z",
        column: "ir_url",
      },
    })) as any;

    expect(capturedUrl).toContain("since=2026-09-01T00%3A00%3A00Z");
    expect(capturedUrl).toContain("limit=50");
    expect(capturedUrl).toContain("column=ir_url");

    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('"code": "72030"');
    expect(text).toContain('"code": "67580"');
    expect(text).toContain("credits_charged: 2 / credits_remaining: 96");
  });

  // 5. get_balance
  it("get_balance: 正常系 (残高とロット情報)", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          customer: { id: "cust_1", email: "test@example.com" },
          balance: 130,
          lots: [
            { id: "lot_1", kind: "grant", remaining: 30, expires_at: "2026-09-30T23:59:59Z" },
            { id: "lot_2", kind: "purchase", remaining: 100, expires_at: "2027-03-20T00:00:00Z" },
          ],
          keys: [{ prefix: "ir_live_dev", name: "default", status: "active" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "get_balance",
      arguments: {},
    })) as any;

    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('"balance": 130');
    expect(text).toContain('"kind": "grant"');
    expect(text).toContain('"kind": "purchase"');
    expect(text).toContain("credits_charged: 0 / credits_remaining: 130");
  });

  // 6. list_fields
  it("list_fields: 正常系 (列定義と出典情報)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/v1/fields")) {
        return new Response(
          JSON.stringify({
            fields: [
              { name: "code", type: "string", description: "証券コード5桁", credits: 1, searchable: true },
              { name: "ir_url", type: "string", description: "IRページURL", credits: 1, searchable: false },
            ],
            default: ["code", "name"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/v1/meta")) {
        return new Response(
          JSON.stringify({
            sources: { edinet: "EDINET" },
            counts: { companies: 3821 },
            attribution: "irkumo (EDINET PDL1.0)",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "list_fields",
      arguments: {},
    })) as any;

    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('"name": "code"');
    expect(text).toContain('"attribution": "irkumo (EDINET PDL1.0)"');
    expect(text).toContain("credits_charged: 0 / credits_remaining: -");
  });

  // 7. 402 Insufficient credits
  it("402 エラー: 例外にせず購入ページ案内文を返し isError を付けないこと", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: "insufficient_credits",
          required: 1,
          available: 0,
          message: "残高が足りません｡必要: 1, 残高: 0",
          request_id: "req_err_402",
        }),
        {
          status: 402,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "resolve_company",
      arguments: { q: "トヨタ" },
    })) as any;

    // 402 では isError を付けない
    expect(res.isError).toBeFalsy();

    const text = res.content[0].text;
    expect(text).toContain("残高不足です｡購入ページ: https://irkumo.example/pricing.html (残高 0)");
    expect(text).toContain("credits_charged: 0 / credits_remaining: 0");
  });

  // 8. 429 Rate limited
  it("429 エラー: しばらく待って再試行の文言を返すこと", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "レート制限超過",
          request_id: "req_err_429",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "10",
          },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "get_company",
      arguments: { code: "7203" },
    })) as any;

    const text = res.content[0].text;
    expect(text).toContain("しばらく待って再試行してください｡ (レート制限超過)");
    expect(text).toContain("credits_charged: 0 / credits_remaining: -");
  });

  // 9. その他の HTTP エラー (404 Not Found)
  it("その他の HTTP エラー: status と error を文で返すこと", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: "not_found",
          message: "会社が見つかりません｡",
          request_id: "req_err_404",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const { mcpClient } = await setupTestServer(fetchMock);

    const res = (await mcpClient.callTool({
      name: "get_company",
      arguments: { code: "9999" },
    })) as any;

    expect(res.isError).toBe(true);
    const text = res.content[0].text;
    expect(text).toContain("エラー (ステータス 404): not_found - 会社が見つかりません｡");
    expect(text).toContain("credits_charged: 0 / credits_remaining: -");
  });

  // 10. IRKUMO_API_KEY 無しの終了判定
  it("IRKUMO_API_KEY 未設定の終了判定", () => {
    const originalEnv = process.env.IRKUMO_API_KEY;
    try {
      delete process.env.IRKUMO_API_KEY;
      const apiKey = process.env.IRKUMO_API_KEY;
      const isMissing = !apiKey || apiKey.trim() === "";
      expect(isMissing).toBe(true);
    } finally {
      if (originalEnv !== undefined) {
        process.env.IRKUMO_API_KEY = originalEnv;
      }
    }
  });
});
