# zinzai (DIGIT)

Slack・Teams・Gmail・Outlook から発生する業務をAIが自動でタスク化し、個人の進捗と心情に配慮したプロジェクト計画を提案・再編成するアプリケーション。

詳しい背景・機能要件は [`docs/DIGIT要件定義書.pdf`](docs/DIGIT要件定義書.pdf) を参照してください。
モックアップはdocsフォルダ内で確認できます。
## 構成

```
digit-app/
├── docs/
│   ├── DIGIT要件定義書.pdf   ← 要件定義書
│   ├── DIGITモック/           ← 手書きモックアップ7点(画面設計の一次情報)
│   └── HANDOFF.md             ← 開発の引き継ぎメモ(直近の実装状況・残タスク)
├── schema.sql                 ← Supabaseのテーブル定義・RLSポリシー(正本)
├── bot/                       ← Slack Bot本体(Python)
└── web/                       ← ダッシュボード(Next.js 16 + Supabase)
```

開発を再開・引き継ぐときは、まず [`docs/HANDOFF.md`](docs/HANDOFF.md) を読んでください。実装状況・画面ごとの仕様の注意点・残作業がまとまっています。

## 開発環境のセットアップ

### 前提

- Node.js / npm
- Python 3
- Supabaseプロジェクト(URL・鍵はチーム内で共有してください)
- Slack App(Bot Token・App Token、Socket Mode)

### 1. Supabase

Supabaseプロジェクトの SQL Editor に [`schema.sql`](schema.sql) の内容を貼り付けて実行してください。

### 2. ダッシュボード(web/)

```bash
cd web
npm install
cp .env.local.example .env.local   # 値を埋める
npm run dev
```

`.env.local` に必要な値:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### 3. Slack Bot(bot/)

```bash
pip install -r requirements.txt
cp .env.example .env   # 値を埋める
python3 -m bot.app
```

`.env` に必要な値:

```
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=
```

Botの起動には、ログイン済みの `claude` CLI(Claude Code)が必要です。Anthropic APIキーは使いません。

### 4. Microsoft Teams / Outlook連携(任意)

Teamsのチャンネルやメールからタスクを自動検知したい場合のみ設定してください。未設定でもアプリの他の機能はすべて動きます。
1つのAzureアプリでTeams・Outlookの両方をカバーする。

1. [Azure Portal](https://portal.azure.com) → 「Microsoft Entra ID」→「アプリの登録」→「新規登録」
   - サポートされているアカウントの種類: 「任意の組織のディレクトリ内のアカウントと、個人のMicrosoftアカウント」を選択
   - リダイレクトURI: 種類「Web」で、以下の2つを両方登録する(本番URLがあればそちらも追加)
     - `http://localhost:3001/api/integrations/teams/callback`
     - `http://localhost:3001/api/integrations/outlook/callback`
2. 登録後、「概要」ページの「アプリケーション(クライアント) ID」を控える → `AZURE_CLIENT_ID`
3. 「証明書とシークレット」→「新しいクライアント シークレット」→ 発行された**値**(Secret ID ではない方)を控える → `AZURE_CLIENT_SECRET`(表示は一度だけなので必ずこの場でコピー)
4. 「APIのアクセス許可」→「アクセス許可の追加」→「Microsoft Graph」→「委任されたアクセス許可」から以下を追加:
   - Teams用: `Chat.Read` `ChannelMessage.Read.All` `Team.ReadBasic.All` `Channel.ReadBasic.All`
   - Outlook用: `Mail.Read`
   - 共通: `offline_access` `User.Read`
   - **Teams系の権限はほぼ全て管理者の同意が必須**です。学校・会社のテナントだと自分では同意できないことが多く、IT管理者への依頼が必要になります(個人のAzureアカウントで自分がテナント管理者なら自己承認できます)。一方 `Mail.Read` は基本的にユーザー本人の同意だけで通ります。
5. `web/.env.local` と ルートの `.env`(Bot用)の両方に `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` を追記する(同じ値)。
6. ダッシュボードの「自分の設定」画面から「連携する」→ Microsoftアカウントでログイン・同意すると連携完了。プロジェクト詳細画面でチーム/チャンネル(Teams)や受信フォルダ(Outlook)を選ぶと、Botが2分おきにポーリングしてタスクらしい内容を承認待ちタスクとして登録します。

**既知の制約(Teams):** Microsoft GraphでTeamsのチャンネルを読むには、接続するアカウントに実際のTeamsライセンス(Microsoft 365 Business/Educationなど)が必要です。Azureの無料試用ディレクトリを作っただけではTeamsライセンスは付与されないため、`No valid license found` のようなエラーが出る場合は、学校/会社の実アカウントで連携するか、Microsoft 365 Business Basicの無料試用(新しい組織を作成)でライセンス付きテナントを別途用意してください。

## 注意事項

- `.env` / `web/.env.local` には秘密情報が入るため、絶対にコミットしないでください(`.gitignore`で除外済み)。
- 画面のレイアウトで要件定義書のテキストと実際の挙動が食い違う場合は、`docs/DIGITモック/` の手書きモックアップ写真を優先してください(こちらが一次情報です)。
