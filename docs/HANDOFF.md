# 引き継ぎ書(digit-app, 2026-08-29作成)

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
