# irkumo-mcp

MCP server for [irkumo](https://irkumo.com), an API that returns the investor relations (IR) page URL and the
earnings release (kessan tanshin) list URL of 3,821 companies listed in Japan, looked up by securities code,
company name, former name or brand name. Free sign-up at https://api.irkumo.com/account/login gives 50 trial
credits (no card required). Set the key as IRKUMO_API_KEY and run `npx -y irkumo-mcp`.

---

上場企業の IR ページや決算短信 URL を検索･取得できる MCP (Model Context Protocol) サーバです｡
stdio 経由で Claude Desktop や Claude Code､Cursor などの AI アシスタントから利用できます｡

## 概要

irkumo-mcp は､上場企業 3,821 社の照合済み IR ページ URL や企業属性を提供する irkumo API の MCP ラッパーです｡
各道具の呼び出し時に必要な列だけを指定し､クレジットを消費してデータを取得します｡

## できること

- 社名や略称･ブランド名から会社コードを 1 社特定 (resolve_company)
- 条件に合う会社候補の一覧検索 (search_companies)
- 証券コード指定での IR ページ URL や属性の取得 (get_company)
- 月次更新などの差分データの取得 (list_changes)
- クレジット残高と有効期限の確認 (get_balance)
- 利用可能な列定義･単価･出典の確認 (list_fields)

## 必要要件

- Node.js 20 以上
- irkumo API キー (https://api.irkumo.com/account/login からメールアドレスだけで無料登録でき､お試し 50 クレジット (30 日間有効) が付きます｡
  リンクを開いたあとアカウントのページでキーを作成してください｡カード登録は不要です)

## インストールと起動

### npx から直接実行 (パッケージ公開後)

```bash
npx irkumo-mcp
```

### ローカルビルドからの実行

```bash
cd mcp
npm install
npm run build
node dist/index.js
```

## 環境変数

| 変数名 | 必須 | 既定値 | 説明 |
|---|---|---|---|
| IRKUMO_API_KEY | はい | なし | irkumo API キー (ir_live_... で始まる文字列)｡未設定でも起動はし､道具の一覧と list_fields は使えますが､ほかの道具は登録の案内を返します |
| IRKUMO_API_BASE | いいえ | https://api.irkumo.com | irkumo API のベース URL｡ローカル開発時は http://127.0.0.1:8787 などを指定します |
| IRKUMO_SITE_URL | いいえ | https://irkumo.com | サイトのベース URL｡402 残高不足時の購入案内リンクに使用されます |

## クライアント設定例

### 1. Claude Desktop

設定ファイル (`claude_desktop_config.json`) に以下を追加します｡

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "irkumo": {
      "command": "npx",
      "args": ["-y", "irkumo-mcp"],
      "env": {
        "IRKUMO_API_KEY": "ir_live_your_api_key_here"
      }
    }
  }
}
```

ローカルビルドを使用する場合:

```json
{
  "mcpServers": {
    "irkumo": {
      "command": "node",
      "args": ["/path/to/ir-url-api/mcp/dist/index.js"],
      "env": {
        "IRKUMO_API_KEY": "ir_live_your_api_key_here",
        "IRKUMO_API_BASE": "http://127.0.0.1:8787"
      }
    }
  }
}
```

### 2. Claude Code

Claude Code CLI では以下のコマンドで追加します｡

```bash
claude mcp add irkumo npx -y irkumo-mcp --env IRKUMO_API_KEY=ir_live_your_api_key_here
```

### 3. Cursor

`.cursor/mcp.json` に以下を追加します｡

```json
{
  "mcpServers": {
    "irkumo": {
      "command": "npx",
      "args": ["-y", "irkumo-mcp"],
      "env": {
        "IRKUMO_API_KEY": "ir_live_your_api_key_here"
      }
    }
  }
}
```

## 道具一覧と消費クレジット

返答の末尾には必ず `credits_charged: N / credits_remaining: M` の 1 行が付加されます｡
既に持っている列を要求すると余計なクレジットを消費するため､必要な列のみを要求してください｡

| 道具名 | 引数 | 返すもの | 消費クレジット |
|---|---|---|---|
| resolve_company | `q`: 検索語 (1~100文字) | 最上位 1 社の code と name と match (stage) | 1 (0 件時は 0) |
| search_companies | `q`: 検索語､`limit`: 件数 (既定 3･最大 5)､`fields`: 属性列 (既定 code,name)､絞り込み条件 | 候補の一覧 | 1 (0 件時は 0) |
| get_company | `code`: 証券コード (4桁/5桁)､`fields`: 列名 (カンマ区切り｡既定 ir_url) | 1 社の指定列データ | 要求した列数 (1列=1クレジット) |
| list_changes | `since`: 開始時点 (ISO 8601 または版名)､`limit`: 件数 (既定 50)､`column`: 列名絞り込み | 変更行の一覧 | 返された行数 (1行=1クレジット) |
| get_balance | なし | クレジット残高とロットの有効期限 | 0 |
| list_fields | なし | 列一覧･単価･出典情報 | 0 |

### 注意点

- `search_companies` の `fields` には属性列 (code, code4, name, name_current, kana, en, industry, fiscal_month, prefecture, city) のみ指定できます｡URL 列 (ir_url, tanshin_url) や別名 (aliases) は指定できません｡
- URL 列が必要な場合は､まず `resolve_company` または `search_companies` で証券コードを取得し､その後 `get_company` で必要な列を指定してください｡

## 残高不足時の案内

クレジット残高が不足した場合 (HTTP 402)､例外 (エラー) にはならず､以下のように購入ページの案内文が返されます｡

```text
残高不足です｡購入ページ: https://irkumo.com/pricing.html (残高 0)
credits_charged: 0 / credits_remaining: 0
```

案内された URL から追加のクレジットパックを購入できます｡

## レート制限

API はキーごとに 20 リクエスト / 10 秒のレート制限が設定されています｡
制限を超過した場合 (HTTP 429) は `しばらく待って再試行してください｡ (レート制限超過)` というメッセージが返されます｡
少し時間をおいてから再試行してください｡
