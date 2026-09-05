-- DIGIT要件定義書(DIGIT-RD-001)+ 手書きモックアップ7点にもとづく digit-app 専用スキーマ。
-- slack-claude-bot/schema.sql とは別物。Supabase の SQL Editor に全文貼り付けて Run してください。
-- 既存の slack-claude-bot 用テーブルとは名前が同じ(profiles/projects/project_members/tasks)ため、
-- 同じ Supabase プロジェクトを使い回す場合、このスキーマを実行すると slack-claude-bot 側のデータも消えます。

drop table if exists tasks cascade;
drop table if exists project_members cascade;
drop table if exists projects cascade;
drop table if exists profiles cascade;

-- ── profiles ─────────────────────────────────────────
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email        text not null,
  created_at   timestamptz default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- スキーマを作り直すたびに既存ログインユーザー分の profiles が消えるので、都度バックフィルする
insert into public.profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data->>'display_name', email)
from auth.users
on conflict (id) do nothing;

-- ── projects ─────────────────────────────────────────
-- モックアップ画面5/6より、参加には「プロジェクト番号(id、重複防止のため自動採番)」と
-- 「パスワード(作成時にオーナーが決める)」の2つを使う。招待メールは使わない。
create table projects (
  id            bigint generated always as identity primary key, -- 「プロジェクト番号」として画面に表示
  name          text not null,
  summary       text,
  password      text not null, -- 参加パスワード(オーナーが作成時に設定)
  owner_id      uuid not null references profiles(id),
  status        text default '進行中',
  deadline      date, -- プロジェクト全体締切(用語定義2章)
  slack_channel text,
  created_at    timestamptz default now()
);

-- ── project_members ──────────────────────────────────
create table project_members (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz default now(),
  unique (project_id, user_id)
);

-- ── tasks ────────────────────────────────────────────
create table tasks (
  id                 bigint generated always as identity primary key,
  project_id         bigint not null references projects(id) on delete cascade,
  title              text not null,
  priority           text not null default '中' check (priority in ('高', '中', '低')),
  assignee_id        uuid references profiles(id),
  due_date           date, -- しめきり日
  estimated_hours    numeric, -- かかる時間(見込み、時間単位)
  planned_start_date date, -- 現在の着手日(AIおすすめ計画の「現在」側)
  status             text not null default '未着手' check (status in ('未着手', '進行中', '完了')),
  notified_at        date,
  progress_comment   text, -- 「このタスクに関する意見」(F-202a、フォロー依頼/期限延長希望など自由記述)
  extracted_intent   text, -- 進捗状況コメントからAIが抽出した意図(フォロー要請/期限延長希望 等、F-202b)
  -- タスク自動収集(F-101〜F-107)関連
  source             text not null default 'manual' check (source in ('slack', 'teams', 'gmail', 'outlook', 'manual')),
  source_url         text, -- 情報元(元のSlackスレッド等へのリンク、F-107)
  approval_status    text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')), -- AI起票分は'pending'(F-106)
  created_at         timestamptz default now()
);

-- ── RLS 判定用ヘルパー関数 ───────────────────────────
create or replace function is_project_member(target_project_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members
    where project_id = target_project_id and user_id = auth.uid()
  );
$$;

create or replace function is_project_owner(target_project_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from projects
    where id = target_project_id and owner_id = auth.uid()
  );
$$;

-- プロジェクト番号(id) + パスワードで参加する(画面⑥「プロジェクト参加」)。
-- SECURITY DEFINER で実行するので、参加者はまだメンバーでない projects 行のRLSを経由せずに照合できる。
create or replace function join_project_by_credentials(p_id bigint, p_password text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from projects where id = p_id and password = p_password
  ) into v_ok;

  if not v_ok then
    raise exception 'プロジェクト番号またはパスワードが正しくありません';
  end if;

  insert into project_members (project_id, user_id, role)
  values (p_id, auth.uid(), 'member')
  on conflict (project_id, user_id) do nothing;

  return p_id;
end;
$$;

grant execute on function join_project_by_credentials(bigint, text) to authenticated;

-- ── RLS 有効化 ───────────────────────────────────────
alter table profiles disable row level security; -- プロフィールは名前解決のため誰でも読めてよい
alter table projects enable row level security;
alter table project_members enable row level security;
alter table tasks enable row level security;

-- projects: メンバーのみ select(オーナーは project_members 登録前でも自分の作成物は見える)
-- 注意: password 自体は select に含まれるので、メンバーになった後は他メンバーにも見える(「参加パスワードの確認」ができる必要があるため意図的)。
create policy "projects_select_members" on projects
  for select using ( owner_id = auth.uid() or is_project_member(id) );
create policy "projects_insert_self" on projects
  for insert with check (owner_id = auth.uid());
create policy "projects_update_owner" on projects
  for update using (owner_id = auth.uid());

-- project_members: 同じプロジェクトのメンバーは閲覧可。
-- 参加(insert)は基本的に join_project_by_credentials() 経由(SECURITY DEFINERなのでRLSを経由しない)。
-- ここでの insert ポリシーは「オーナーが自分自身を最初に登録する」ケースのためだけに存在する。
create policy "members_select_same_project" on project_members
  for select using ( is_project_member(project_id) );
create policy "members_insert_self" on project_members
  for insert with check ( user_id = auth.uid() );
create policy "members_delete_owner" on project_members
  for delete using ( is_project_owner(project_id) );

-- tasks: プロジェクトのメンバーなら select/insert/update 可
-- (承認待ちタスクは担当者未定のことが多く、誰でも承認/却下できる必要があるため update もメンバー全体に開放)
create policy "tasks_select_members" on tasks
  for select using ( is_project_member(project_id) );
create policy "tasks_insert_members" on tasks
  for insert with check ( is_project_member(project_id) );
create policy "tasks_update_members" on tasks
  for update using ( is_project_member(project_id) );

-- ── ツール連携(Teams/Outlook)のOAuth接続 ──────────────
-- F-101/103/104(マルチツール タスク自動収集)。Gmailはメンバーが別途対応済みのためここでは扱わない。
create table user_integrations (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references profiles(id) on delete cascade,
  provider      text not null check (provider in ('teams', 'outlook')),
  account_email text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz default now(),
  unique (user_id, provider)
);

-- プロジェクトごとに、どのTeamsチャンネル/Outlookフォルダを見るかの設定(F-108)
create table project_integrations (
  id                  bigint generated always as identity primary key,
  project_id          bigint not null references projects(id) on delete cascade,
  provider            text not null check (provider in ('teams', 'outlook')),
  external_team_id    text,
  external_channel_id text,
  channel_name        text,
  enabled             boolean not null default true,
  last_synced_at      timestamptz,
  created_at          timestamptz default now(),
  unique (project_id, provider)
);

alter table user_integrations enable row level security;
alter table project_integrations enable row level security;

-- 自分のOAuth接続情報(アクセストークン含む)は自分だけが読み書きできる
create policy "user_integrations_own" on user_integrations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- プロジェクトの連携設定はメンバーなら閲覧可、オーナーのみ書き込み可
create policy "project_integrations_select_members" on project_integrations
  for select using (is_project_member(project_id));
create policy "project_integrations_write_owner" on project_integrations
  for all using (is_project_owner(project_id)) with check (is_project_owner(project_id));

-- ── Gmail連携(メンバー担当分) ─────────────────────────
-- F-104。1プロジェクトに複数のGmailアカウントを連携できる(project_id + account_emailの組でunique)。
create table gmail_connections (
  id               bigint generated always as identity primary key,
  project_id       bigint not null references projects(id) on delete cascade,
  account_email    text not null,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  sender_filter    text,
  connected_by     uuid references profiles(id),
  connected_at     timestamptz default now(),
  unique (project_id, account_email)
);

alter table gmail_connections enable row level security;

-- access_token/refresh_token という機微な値を含むため、プロジェクトのオーナーのみ読み書きできるようにする
create policy "gmail_connections_owner_all" on gmail_connections
  for all using (is_project_owner(project_id)) with check (is_project_owner(project_id));

-- サーバー側(Bot・リマインダー)は sb_secret_ キーで RLS をバイパスして全件取得する想定。
