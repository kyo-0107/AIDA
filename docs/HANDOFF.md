# 引き継ぎ書(digit-app, 2026-08-29作成)

## 2026-09-05 追加: Outlook連携(F-104) + Teamsの既知の制約

- **Teamsは実機テストで「No valid license found」に遭遇し、今日のハッカソンでは保留**。原因は、接続したMicrosoftアカウント(Azure無料試用で作った個人ディレクトリ)にTeamsライセンスが無いこと。Teams関連のGraph権限(`ChannelMessage.Read.All`等)はほぼ全て管理者同意必須で、学校テナントでもIT管理者の許可が要る可能性が高い。コード自体は実装済みで、ライセンス付きアカウント(学校の実アカウント、またはMicrosoft 365 Business Basic無料試用で作った新規テナント)があれば動くはず。
- **Outlook連携(F-104)を実装**。`Mail.Read`は基本的にユーザー本人の同意だけで通るため、Teamsで詰まった管理者同意の壁を回避できる。
  - `web/lib/msgraph.ts`を汎用化(`getValidAccessToken(supabase, userId, provider)`、`OUTLOOK_SCOPES`追加)。
  - OAuthのconnect/callbackルートは`web/lib/oauth-connect.ts`に共通化(`makeConnectHandler`/`makeCallbackHandler`)。Teams側もこちらに統一。`app/api/integrations/{teams,outlook}/{connect,callback}/route.ts`はどちらもこのファクトリを呼ぶだけの薄いラッパー。
  - Outlookのフォルダ一覧: `app/api/integrations/outlook/folders/route.ts`(`GET /me/mailFolders`)。
  - プロジェクト設定UI: `project/[id]/outlook-folder-picker.tsx`(Teamsのチャンネル選択より単純、フォルダ1階層のみ)。
  - Botのポーリング: `bot/outlook.py`(2分おき、`GET /me/mailFolders/{id}/messages`)。Teamsとの共通ロジック(タスク判定のプロンプト・HTML除去)は`bot/task_classifier.py`に切り出した。
  - `bot/msgraph.py`の`get_valid_access_token(sb, user_id, provider)`もprovider引数を取るよう汎用化(以前は`teams`固定だった)。
- **Gmail(メンバー担当分)**: `gmail_connections`テーブルを追加(RLS: オーナーのみ読み書き)。その後 `unique(project_id)` → `unique(project_id, account_email)` に変更し、1プロジェクトに複数のGmailアカウントを連携できるようにした。実装自体はメンバー側で進行中、この session ではスキーマ追加のみ対応。

## 2026-08-29 追加: Microsoft Teams連携(OAuth本実装) + AI検索

## 2026-08-29 追加: Microsoft Teams連携(OAuth本実装) + AI検索

- **AI検索**: `lib/ai-search.ts`。プロジェクト一覧(`/projects`)とタスク一覧(`/tasks`)の検索ボックスに、`claude` CLI経由の自然文検索を追加。失敗/タイムアウト(20秒)時は部分一致にフォールバックする。Anthropic APIキーは使わない(既存のSlack Bot連携と同じ方式)。
- **Teams連携(OAuth)**: Gmailはメンバーが別途対応済みのため対象外。Teams/Outlookのうち、今回はTeamsを本実装した。
  - スキーマ追加: `user_integrations`(ユーザーごとのOAuthトークン、`user_id`+`provider`でunique)、`project_integrations`(プロジェクトごとにどのチーム/チャンネルを見るか、`project_id`+`provider`でunique)。
  - OAuthフロー(Authorization Code Grant): `web/app/api/integrations/teams/{connect,callback}/route.ts`。CSRF対策として、`state`はサーバーで発行してHttpOnly Cookieに保存し、コールバック時に突き合わせる(クライアントから来た`state`だけを信用しない)。ユーザーとトークンの紐づけは、コールバック時点の実際のログインセッションを常に使う(state値をユーザーIDとして信用しない設計)。
  - チャンネル一覧取得: `web/app/api/integrations/teams/channels/route.ts` → `GET /me/joinedTeams` → 各チームで `GET /teams/{id}/channels`。
  - プロジェクト設定UI: `project/[id]/teams-channel-picker.tsx`(クライアントコンポーネント)。オーナーのみ操作可能(RLSの`project_integrations_write_owner`ポリシーと一致)。
  - Botのポーリング: `bot/teams.py`(2分おき)。`bot/msgraph.py`でトークンの取得/更新。メッセージ本文をClaudeに渡し、タスクらしいかどうかを判定(`is_task`)。該当すれば`create_task_from_source(source="teams")`で承認待ちタスクとして登録(Slackの📝リアクション起票と同じ`approval_status='pending'`の仕組みを再利用)。
  - 初回ポーリングでは既存メッセージを遡って処理しない(`last_synced_at`が未設定ならその時点の時刻を保存するだけで終わる)。
  - **未デプロイ環境での制約**: Microsoft Graphのプッシュ通知(change notifications/webhook)は公開HTTPSエンドポイントが必須のため、ローカル開発中は使えない。そのためポーリング方式にしている。デプロイ後、必要ならwebhook化を検討する。
  - **ユーザー側の残作業**: Azure ADアプリ登録(手順は`README.md`に記載)。`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`を`web/.env.local`と ルート`.env`(Bot用)の両方に設定する必要がある。まだ実機でのOAuthフロー・ポーリングの動作確認はしていない。
  - Outlook(メール)連携は今回未着手。同じ`user_integrations`/`project_integrations`テーブル(providerを'outlook'にする想定)とMicrosoft Graphの`Mail.Read`スコープを使えば、似た構成で追加できるはず。

## 2026-08-29 追加: レイアウト改善(サイドバー常時表示・タブ順・画面幅)

ユーザーからのフィードバックで以下を変更した:

- プロジェクト一覧・新規作成・参加を、上部タブから**左サイドバー常時表示**に変更(`app/components/sidebar.tsx`)。`app/(dashboard)/layout.tsx` でラップし、全ダッシュボード画面に共通で表示される。
- グローバルタブの並びを「カレンダー→タスク一覧→AI」に変更(`app/components/tab-nav.tsx`、`usePathname()`でアクティブ判定するクライアントコンポーネント)。「プロジェクト一覧」「自分の編集」はタブから外し、それぞれサイドバーと設定アイコン(top-bar.tsx)に統合。
- 新規画面 `/tasks`(`app/(dashboard)/tasks/page.tsx`): 全プロジェクト横断のタスク一覧。期限順・優先度順・プロジェクト別の並び替え/絞り込みに対応(要件定義書の画面②に相当)。
- 各ページの `mx-auto max-w-Xxl` のような幅制限を撤廃し、サイドバー+可変幅の2カラムレイアウトに変更。画面サイズにフィットするようにした。
- ルーティングは `app/(dashboard)/` というroute groupの中に page.tsx・plan・profile・project・projects・tasks をまとめた(URLパスは変化なし)。

新しいチャットで作業を続ける人向けのメモ。`slack-claude-bot/` とは完全に別の新規アプリ。

## これは何か

`DIGIT要件定義書.pdf`(DIGIT-RD-001, Ver1.0 draft)と、手書きモックアップ7点(`docs/DIGITモック/`)にもとづいて
ゼロから作り直しているアプリ。「Slack等からのタスク自動収集」＋「AIによる着手日の再提案」が中核機能。

`slack-claude-bot/`(旧アプリ)は今後さわらない想定。同じSupabaseプロジェクトを使い回しているため、
このアプリのスキーマを適用した時点で旧アプリのデータ(プロジェクト/タスク)は失われている。

## 全体構成

```
digit-app/
├── docs/
│   ├── DIGIT要件定義書.pdf
│   ├── DIGITモック/          ← 手書きモックアップ7点の写真(画面設計の一次情報)
│   └── HANDOFF.md            ← このファイル
├── schema.sql                ← Supabaseのテーブル定義・RLSポリシー(正本)
├── .env                      ← bot/ が読む(Slackトークン + Supabase、旧アプリと同じSlack App/Supabaseプロジェクトを再利用)
├── bot/                      ← Slack Bot本体(Python)。slack-claude-bot/agent/ を新スキーマ向けに移植したもの
│   ├── app.py                  claudeコマンド呼び出し・質問応答・📝リアクションでのタスク自動起票
│   ├── db.py                   Bot用データアクセス(service_roleキーでRLS無視)
│   ├── reminder.py             期日リマインダー
│   └── supa.py                 Supabaseクライアント生成
└── web/                     ← ダッシュボード(Next.js 16)
    ├── .env.local             web/ が読む(Supabaseのみ、旧アプリと同じ値)
    ├── lib/current-user.ts     ログインユーザー+表示名をまとめて取る共通ヘルパー
    ├── lib/plan.ts             AIおすすめ計画の着手日提案ロジック(ルールベース)
    └── app/
        ├── components/app-nav.tsx   全画面共通ヘッダー(アイコン+名前/検索+設定/4タブ)
        ├── page.tsx                 ①ホーム = カレンダー表示(初期表示)
        ├── projects/page.tsx        ④プロジェクト管理画面(作成・参加・一覧・フィルター)
        ├── plan/page.tsx            ③AIおすすめ計画画面(着手日の提案テーブル)
        ├── profile/page.tsx         自分の編集(表示名)
        └── project/[id]/
            ├── page.tsx             ⑥プロジェクト詳細相当(タスク一覧、番号/パスワード表示)
            ├── task-row.tsx
            ├── project-credentials-box.tsx  番号・パスワードのコピー用チップ
            └── task/[taskId]/page.tsx       ⑦タスク編集画面
```

## モックアップから判明した実際の画面仕様(要件定義書のテキストと食い違う点あり)

要件定義書のテキスト説明だけでは分からなかった/違っていた点。**画面設計に迷ったら`docs/DIGITモック/`の写真を見るのが一次情報。**

- **参加方式**: メール招待ではなく「プロジェクト番号(id、自動採番)」＋「パスワード(作成時にオーナーが手入力)」の組み合わせ。要件定義書は「参加パスワード(招待コード)」とだけ書いていて自動発行っぽく見えるが、モックアップ⑤には「パスワード ___」という空欄の入力欄があり、オーナーが決める設計だった。
- **画面⑥は「プロジェクト詳細」ではなく「プロジェクト参加」画面**(名/番号/パスワードを入力して参加する画面)。要件定義書のテキストでは画面⑥=プロジェクト詳細と書かれていたが、モックアップの手書きタイトルは「プロジェクト参加」。プロジェクト詳細に相当する内容(番号・パスワードの確認、タスク一覧)は今回`project/[id]/page.tsx`に実装している。
- **画面⑦は「タスクの編集画面」**。項目は タスク名・担当者・しめきり日・かかる時間・情報元(Slackスレッド等)・プロジェクト・削除・進捗状況(未着手/進行中/完了)・このタスクに関する意見(自由記述)。「このタスクに関する意見」がF-202a(進捗状況の自由記述)に対応する。
- **画面③(AIおすすめ計画)は表形式**: タスク名｜現在の着手日｜提案する変更日｜理由、という列構成で、承認・一括承認・却下のボタンがある。「現在の着手日」と「AIが提案する変更後の着手日」を比較して見せる設計。これに対応するため`tasks.planned_start_date`(現在の着手日)と`tasks.estimated_hours`(かかる時間の見込み)を新設した。
- **全画面共通のヘッダー**: 左にアイコン+名前、右に「プロジェクトを検索」ボックスと設定アイコン。その下に4つのグローバルタブ「プロジェクト一覧／AI／カレンダー／自分の編集」。初期表示(ログイン後の最初の画面)はカレンダー。

## 現在の実装状況(2026-08-29時点)

- **web/**: 上記の画面構成で実装済み。`npx tsc --noEmit` と `npx next build` は通っている。ローカルでは `http://localhost:3001` で起動中(旧アプリの `http://localhost:3000` とポートを分けている)。
- **bot/**: `slack-claude-bot/agent/` からの移植。まだ実機での動作確認はしていない(旧アプリ側では確認済みの機能をスキーマ変更に合わせて移植しただけ)。
- **AIおすすめ計画のロジック**: `lib/plan.ts`の`suggestStartDate()`。締切・見込み時間(1日6時間换算)・優先度からのルールベースで、本物のAI(Claude)は呼んでいない。心情的配慮(F-202/202b、進捗コメントからの意図抽出)も未実装。
- **タスク自動収集(📝リアクション)**: `bot/app.py`の`on_taskify_reaction`。ロジックは旧アプリと同じ(Claude CLIで要約→`approval_status='pending'`で登録)だが、フィールド名を新スキーマ(`progress_comment`)に合わせて変更した。

## ユーザーに残っている作業

1. **Slack Appの設定**(旧アプリと同じSlack Appを再利用する前提):
   - Bot Token Scopesに `reactions:read` と `channels:history` (プライベートチャンネルも使うなら `groups:history`)が付いているか確認。
   - Event Subscriptions → Subscribe to bot events に `reaction_added` が付いているか確認。
   - 未設定なら追加してReinstall。
2. **Botの起動**: `cd digit-app && python3 -m bot.app` (旧アプリの`slack-claude-bot`ディレクトリからではなく、`digit-app`ディレクトリから起動すること。`.mcp.json`はDIGITフォルダ直下にあるので、`digit-app/`配下から`claude`コマンドを呼んでも自動で有効になるはず)。
3. **実機での動作確認**: ダッシュボード(`http://localhost:3001`)でプロジェクト作成→番号とパスワードが表示されるか、別アカウントで参加できるか、タスク追加→編集→AIおすすめ計画画面での提案表示、Slackでの📝リアクション起票、を一通り試す。
4. まだ手をつけていない箇所: F-202b(進捗コメントからのAIによる意図抽出)、AIおすすめ計画への本物のClaude連携(現状はルールベース)、Teams/Gmail/Outlook連携(Should優先度)、自動再計算(1日1回)のスケジューラー。

## 起動コマンド

```bash
# ダッシュボード(ローカル)
cd "/Users/kyo/Library/CloudStorage/GoogleDrive-ktym.kyou0107@gmail.com/マイドライブ/DIGIT/digit-app/web"
npm run dev -- -p 3001

# Slack Bot
cd "/Users/kyo/Library/CloudStorage/GoogleDrive-ktym.kyou0107@gmail.com/マイドライブ/DIGIT/digit-app"
python3 -m bot.app
```

デプロイ(Cloudflare Workers等)はまだ行っていない。旧アプリでやった手順(`@opennextjs/cloudflare`)を踏襲すればできるはずだが未着手。
