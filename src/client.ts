/**
 * irkumo API クライアント
 * workers/src/routes/*.ts の契約に準拠
 */

export interface IrkumoClientOptions {
  apiKey: string;
  baseUrl?: string;
  siteUrl?: string;
  fetchFn?: typeof fetch;
}

export interface ClientResult {
  ok: boolean;
  status: number;
  text: string;
  data?: unknown;
}

export interface SearchParams {
  q: string;
  limit?: number;
  fields?: string;
  industry?: string;
  fiscal_month?: number;
  prefecture?: string;
  city?: string;
  has_ir?: boolean;
  has_tanshin?: boolean;
  ir_seed?: string;
}

export interface ChangesParams {
  since: string;
  limit?: number;
  column?: string;
}

export const SEARCHABLE_FIELDS = new Set([
  "code",
  "code4",
  "name",
  "name_current",
  "kana",
  "en",
  "industry",
  "fiscal_month",
  "prefecture",
  "city",
]);

export const URL_FIELDS = new Set([
  "ir_url",
  "tanshin_url",
  "ir_source",
  "ir_seed",
  "tanshin_basis",
]);

export class IrkumoClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly siteUrl: string;
  readonly fetchFn: typeof fetch;
  lastCreditsRemaining: number | null = null;

  constructor(options: IrkumoClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.irkumo.com").replace(/\/+$/, "");
    this.siteUrl = (options.siteUrl || "https://irkumo.com").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  }

  formatWithCredits(body: string, charged: number, remaining: number | string): string {
    const trimmed = body.trimEnd();
    return `${trimmed}\ncredits_charged: ${charged} / credits_remaining: ${remaining}`;
  }

  async request(path: string, init?: RequestInit): Promise<ClientResult> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init?.headers);
    headers.set("X-API-Key", this.apiKey);

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        ...init,
        headers,
      });
    } catch (err) {
      const rem = this.lastCreditsRemaining ?? "-";
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        text: this.formatWithCredits(`通信エラーが発生しました: ${msg}`, 0, rem),
      };
    }

    const remainingHeader = res.headers.get("X-Credits-Remaining");
    if (remainingHeader !== null && remainingHeader !== "") {
      const n = Number(remainingHeader);
      if (Number.isFinite(n)) {
        this.lastCreditsRemaining = n;
      }
    }

    let json: any = null;
    const contentType = res.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    } else {
      try {
        const text = await res.text();
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      } catch {
        json = null;
      }
    }

    if (res.status === 402) {
      const available =
        json && typeof json.available === "number"
          ? json.available
          : (this.lastCreditsRemaining ?? 0);
      this.lastCreditsRemaining = available;
      const msg = `残高不足です｡購入ページ: ${this.siteUrl}/pricing.html (残高 ${available})`;
      return {
        ok: false,
        status: 402,
        text: this.formatWithCredits(msg, 0, available),
        data: json,
      };
    }

    if (res.status === 429) {
      const rem = this.lastCreditsRemaining ?? "-";
      const msg = "しばらく待って再試行してください｡ (レート制限超過)";
      return {
        ok: false,
        status: 429,
        text: this.formatWithCredits(msg, 0, rem),
        data: json,
      };
    }

    if (!res.ok) {
      const rem = this.lastCreditsRemaining ?? "-";
      const errCode = json?.error || "error";
      const errMsg = json?.message || res.statusText || "リクエストに失敗しました｡";
      const msg = `エラー (ステータス ${res.status}): ${errCode} - ${errMsg}`;
      return {
        ok: false,
        status: res.status,
        text: this.formatWithCredits(msg, 0, rem),
        data: json,
      };
    }

    if (json && json.credits && typeof json.credits.remaining === "number") {
      this.lastCreditsRemaining = json.credits.remaining;
    }

    return {
      ok: true,
      status: res.status,
      text: "",
      data: json,
    };
  }

  async resolveCompany(q: string): Promise<ClientResult> {
    const query = new URLSearchParams();
    query.set("q", q);
    query.set("limit", "1");
    query.set("fields", "code,name");

    const res = await this.request(`/v1/search?${query.toString()}`);
    if (!res.ok) return res;

    const data = res.data as {
      total: number;
      items?: Array<{ code: string; name: string; match?: unknown }>;
      credits?: { charged: number; remaining: number };
    };

    const items = data?.items || [];
    if (items.length === 0) {
      const charged = data?.credits?.charged ?? 0;
      const rem = data?.credits?.remaining ?? (this.lastCreditsRemaining ?? 0);
      return {
        ok: true,
        status: 200,
        text: this.formatWithCredits("該当する会社が見つかりませんでした｡", charged, rem),
        data,
      };
    }

    const top = items[0];
    const payload = {
      code: top.code,
      name: top.name,
      match: top.match,
    };
    const charged = data?.credits?.charged ?? 1;
    const rem = data?.credits?.remaining ?? (this.lastCreditsRemaining ?? 0);
    return {
      ok: true,
      status: 200,
      text: this.formatWithCredits(JSON.stringify(payload, null, 2), charged, rem),
      data,
    };
  }

  async searchCompanies(params: SearchParams): Promise<ClientResult> {
    if (params.fields) {
      const parsedFields = params.fields
        .split(",")
        .map((f) => f.trim().toLowerCase())
        .filter((f) => f.length > 0);

      const hasUrlField = parsedFields.some((f) => URL_FIELDS.has(f));
      if (hasUrlField) {
        const rem = this.lastCreditsRemaining ?? "-";
        const msg =
          "search_companies の fields には属性列 (code, code4, name, name_current, kana, en, industry, fiscal_month, prefecture, city) のみ指定できます｡URL列 (ir_url, tanshin_url) は get_company を使用してください｡";
        return {
          ok: false,
          status: 400,
          text: this.formatWithCredits(msg, 0, rem),
        };
      }
    }

    const query = new URLSearchParams();
    query.set("q", params.q);
    const limit = Math.max(1, Math.min(params.limit ?? 3, 5));
    query.set("limit", String(limit));
    query.set("fields", params.fields || "code,name");

    if (params.industry !== undefined) query.set("industry", params.industry);
    if (params.fiscal_month !== undefined) query.set("fiscal_month", String(params.fiscal_month));
    if (params.prefecture !== undefined) query.set("prefecture", params.prefecture);
    if (params.city !== undefined) query.set("city", params.city);
    if (params.has_ir !== undefined) query.set("has_ir", params.has_ir ? "true" : "false");
    if (params.has_tanshin !== undefined) query.set("has_tanshin", params.has_tanshin ? "true" : "false");
    if (params.ir_seed !== undefined) query.set("ir_seed", params.ir_seed);

    const res = await this.request(`/v1/search?${query.toString()}`);
    if (!res.ok) return res;

    const data = res.data as {
      total: number;
      limit: number;
      offset: number;
      items: unknown[];
      credits?: { charged: number; remaining: number };
    };

    const payload = {
      total: data.total,
      limit: data.limit,
      offset: data.offset,
      items: data.items,
    };
    const charged = data.credits?.charged ?? (payload.items.length > 0 ? 1 : 0);
    const rem = data.credits?.remaining ?? (this.lastCreditsRemaining ?? 0);
    return {
      ok: true,
      status: 200,
      text: this.formatWithCredits(JSON.stringify(payload, null, 2), charged, rem),
      data,
    };
  }

  async getCompany(code: string, fields?: string): Promise<ClientResult> {
    const queryFields = fields || "ir_url";
    const query = new URLSearchParams();
    query.set("fields", queryFields);

    const res = await this.request(`/v1/companies/${encodeURIComponent(code)}?${query.toString()}`);
    if (!res.ok) return res;

    const data = res.data as Record<string, any>;
    const { credits, request_id, data_version, ...companyData } = data;
    const charged = credits?.charged ?? 1;
    const rem = credits?.remaining ?? (this.lastCreditsRemaining ?? 0);

    return {
      ok: true,
      status: 200,
      text: this.formatWithCredits(JSON.stringify(companyData, null, 2), charged, rem),
      data,
    };
  }

  async listChanges(params: ChangesParams): Promise<ClientResult> {
    const query = new URLSearchParams();
    query.set("since", params.since);
    const limit = Math.max(1, Math.min(params.limit ?? 50, 1000));
    query.set("limit", String(limit));
    if (params.column) {
      query.set("column", params.column);
    }

    const res = await this.request(`/v1/changes?${query.toString()}`);
    if (!res.ok) return res;

    const data = res.data as {
      total: number;
      limit: number;
      offset: number;
      items: unknown[];
      credits?: { charged: number; remaining: number };
    };

    const payload = {
      total: data.total,
      limit: data.limit,
      offset: data.offset,
      items: data.items,
    };
    const charged = data.credits?.charged ?? (payload.items?.length ?? 0);
    const rem = data.credits?.remaining ?? (this.lastCreditsRemaining ?? 0);

    return {
      ok: true,
      status: 200,
      text: this.formatWithCredits(JSON.stringify(payload, null, 2), charged, rem),
      data,
    };
  }

  async getBalance(): Promise<ClientResult> {
    const res = await this.request("/v1/account");
    if (!res.ok) return res;

    const data = res.data as {
      customer: unknown;
      balance: number;
      lots: unknown[];
      keys: unknown[];
    };
    this.lastCreditsRemaining = data.balance;

    const payload = {
      balance: data.balance,
      lots: data.lots,
      keys: data.keys,
    };

    return {
      ok: true,
      status: 200,
      text: this.formatWithCredits(JSON.stringify(payload, null, 2), 0, data.balance),
      data,
    };
  }

  async listFields(): Promise<ClientResult> {
    const [fieldsRes, metaRes] = await Promise.all([
      this.request("/v1/fields"),
      this.request("/v1/meta"),
    ]);

    if (!fieldsRes.ok) return fieldsRes;

    const fieldsData = fieldsRes.data as {
      fields: unknown[];
      default: string[];
    };
    const metaData = (metaRes.ok ? metaRes.data : null) as {
      sources?: unknown;
      counts?: unknown;
      attribution?: string;
    } | null;

    const payload = {
      fields: fieldsData.fields,
      default: fieldsData.default,
      sources: metaData?.sources,
      counts: metaData?.counts,
      attribution: metaData?.attribution,
    };

    const rem = this.lastCreditsRemaining ?? "-";
    return {
      ok: true,
      status: 200,
      text: this.formatWithCredits(JSON.stringify(payload, null, 2), 0, rem),
      data: payload,
    };
  }
}
