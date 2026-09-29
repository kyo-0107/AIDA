# AIDA (DIGIT)

**DIGIT IT KITAQ 2026** で開発したPM（プロジェクト管理）ツールです。

Slack・Teams・Gmail・Outlook から発生する業務をAIが自動でタスク化し、個人の進捗と心情に配慮したプロジェクト計画を提案・再編成します。

「チャットやメールからタスクを拾う」だけでなく、拾った後に担当者の負荷・有給予定・心情的なSOS（フォロー要請や期限延長希望）まで読み取ってスケジュールを組み直す点が特徴です。AIによる自動化はすべて「下書き・提案」までで、最終的な確定は必ず人が確認・承認します。

## 主な機能

要件定義書（[`docs/DIGIT要件定義書.pdf`](docs/DIGIT要件定義書.pdf)）の機能要件を実装したものです。

### タスク自動収集
- **Slack連携によるタスク検知**: 指定リアクション（📝など）を付けたメッセージをAIが要約してタスク化
- **Slackスレッドからの手動起票**: スレッドを起点にタスクを起票
- **Microsoft Teams連携**: チャンネル・チャットからのタスク検知
- **メール連携（Gmail / Outlook）**: 受信メールを解析し、依頼・締切のあるメールをタスク化
- **AIによる要約・タスク化**: 本文からタスク名・想定期限・優先度を自動で仮設定
- **承認待ちフロー**: AIが自動生成したタスクは「承認待ち」状態で登録し、内容を確認・修正・却下してから確定（誤検知の抑制）
- **元メッセージへの参照リンク**: 生成されたタスクから元のSlackスレッド・メールへ直接遷移可能
- **連携先ごとのON/OFF設定**: プロジェクト・メンバー単位でSlack／Teams／Gmail／Outlook連携を切替可能

### AI計画提案・再編成
- **おすすめ計画の自動生成**: 締切・進捗率・所要見込み時間から日次／週次の理想スケジュールをAIが生成
- **心情的配慮を反映した再編成**: タスク詳細の「進捗状況」欄に書かれた自由記述（例:「フォローが欲しい」「期限を伸ばしてほしい」）をAIが読み取り、計画再編成の判断材料にする
- **自由記述からの意図抽出**: フォロー要請・期限延長希望などの意図を自動判定
- **再計算タイミングの選択**: 今すぐ再計算／自動再計算（1回／日）を切替
- **提案理由の明示**: AIが計画を提案・変更する際、その根拠を理由文として表示
- **プロジェクト単位／全体単位の切替**: 計画表示の粒度を切替可能
- **提案の手動修正**: AIが生成した計画・タスクの割り当てはいつでも手動修正可能
- **並び替え・絞り込み**: 締切順・優先度順・プロジェクト単位でのフィルター

### プロジェクト・タスク管理
- 参加プロジェクトの一覧・進捗率表示
- プロジェクトの新規作成（プロジェクト名・参加パスワードの設定）
- プロジェクト詳細画面でのメンバー招待・タスク一覧確認
- タスクの完了操作・担当者追加・期限の追加／変更
- AI起票タスクの承認待ち状態の表示（承認前後で区別）
- 有給休暇の登録・残日数表示（メンバーの負荷把握に利用）

詳しい背景・用語定義・非機能要件などは [`docs/DIGIT要件定義書.pdf`](docs/DIGIT要件定義書.pdf) を参照してください。モックアップはdocsフォルダ内で確認できます。

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

### 5. Gmail連携(任意)

1. [Google Cloud Console](https://console.cloud.google.com) でプロジェクトを作成(または既存のものを使う)
2. 「APIとサービス」→「認証情報」→「OAuth クライアント ID を作成」(種類: ウェブアプリケーション)
   - 承認済みのリダイレクトURI: `http://localhost:3001/api/gmail/callback`
3. 「APIとサービス」→「有効なAPIとサービス」→「Gmail API」を有効化
4. クライアントIDとシークレットを `web/.env.local` に設定:
   ```
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/gmail/callback
   ```
5. `ENCRYPTION_KEY`(OAuthトークンの暗号化用)を `openssl rand -hex 32` で生成して設定
6. `POLL_SECRET`(新着メールをチェックするAPIを叩くための合言葉)を適当な文字列で設定
7. Teams/Outlookと同じく、「自分の設定」画面から「連携する」→ Googleアカウントでログイン・同意すると連携完了(1人1アカウント)
8. プロジェクト詳細画面(オーナーのみ)で、監視したい送信者アドレス(空欄なら全件対象)を設定して有効化する
9. 新着メールのチェックは自動実行の仕組みがまだ無いため、手動で以下を実行する:
   ```bash
   curl -X POST http://localhost:3001/api/poll-gmail -H "Authorization: Bearer <POLL_SECRETの値>"
   ```
   (対象は「未読メール」。チェック済みのメールは既読にする/しないに関わらずタスク化されたら重複登録されない)

## 注意事項

- `.env` / `web/.env.local` には秘密情報が入るため、絶対にコミットしないでください(`.gitignore`で除外済み)。
- 画面のレイアウトで要件定義書のテキストと実際の挙動が食い違う場合は、`docs/DIGITモック/` の手書きモックアップ写真を優先してください(こちらが一次情報です)。
