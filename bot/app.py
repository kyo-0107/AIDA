"""Slack bot — Claude Code の `claude` コマンドを呼び出す版(Anthropic API キー不要)

プロジェクト/タスク/メンバーに関する質問には、Supabase MCP経由でClaude自身がデータを取得して答える。
また、メッセージに📝(memo)リアクションを付けると、そのメッセージをAIが要約してタスク化する(F-102/105/106/107)。
"""
import json
import os
import shutil
import subprocess

from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

from . import db, outlook, reminder, teams

load_dotenv()

# Windows では実体が claude.cmd のことがある。.env の CLAUDE_BIN で上書き可能。
CLAUDE = os.getenv("CLAUDE_BIN") or shutil.which("claude") or "claude"

ROLE = (
    "あなたはプロジェクト管理のアシスタントです。Supabase MCPツール(mcp__supabase__*)を使って、"
    "Postgresデータベースから必要な情報を取得したうえで、日本語で3〜5行くらいで簡潔に答えてください。\n\n"
    "テーブル構成:\n"
    "- profiles(id, email, display_name)\n"
    "- projects(id, name, summary, password, owner_id, status, deadline, slack_channel)\n"
    "- project_members(project_id, user_id, role)\n"
    "- tasks(id, project_id, title, progress_comment, priority, assignee_id, due_date, "
    "estimated_hours, planned_start_date, status, source, source_url, approval_status)\n\n"
    "【重要な制約】以下の【アクセス範囲】に書かれた project_id 以外の projects/tasks の行は、"
    "たとえ質問文にプロジェクト名が出てきても絶対に参照したり、その内容を答えに含めたりしないでください。"
    "範囲外のプロジェクトについて聞かれたら「そのプロジェクトの情報を答える権限がありません」と答えてください。"
    "クエリした結果、情報が無ければ推測せず「その情報はありません」と答えてください。"
)

sessions = {}  # Slack のスレッド ts -> claude のセッション ID


def build_prompt(question, requester_email):
    scope = db.scope_notice(requester_email)
    return f"{ROLE}\n\n【アクセス範囲】\n{scope}\n\n【質問】\n{question}"


def ask_claude(prompt, session_id=None, allowed_tools="mcp__supabase__*"):
    cmd = [CLAUDE, "-p", prompt, "--output-format", "json"]
    if allowed_tools:
        cmd += ["--allowedTools", allowed_tools]
    if session_id:
        cmd += ["--resume", session_id]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", timeout=300
        )
    except FileNotFoundError:
        return "claude コマンドが見つかりません。.env に CLAUDE_BIN を設定してください。", None
    except subprocess.TimeoutExpired:
        return "時間がかかりすぎたので中断しました。", session_id

    if result.returncode != 0:
        return "エラーが起きました:\n```" + result.stderr.strip()[:500] + "```", session_id

    data = json.loads(result.stdout)
    return data["result"], data.get("session_id")


def resolve_email(client, slack_user_id):
    """Slack ユーザーIDからメールアドレスを引く(要 users:read.email スコープ)。"""
    try:
        info = client.users_info(user=slack_user_id)
        return info["user"]["profile"].get("email")
    except Exception:
        return None


app = App(token=os.environ["SLACK_BOT_TOKEN"])


def handle_question(event, client, say, text):
    thread = event.get("thread_ts") or event["ts"]
    waiting = say(text="考え中…", thread_ts=thread)

    email = resolve_email(client, event["user"])
    prompt = build_prompt(text, email)
    answer, session_id = ask_claude(prompt, sessions.get(thread))
    if session_id:
        sessions[thread] = session_id

    client.chat_update(channel=event["channel"], ts=waiting["ts"], text=answer)


@app.event("app_mention")
def on_mention(event, client, say):
    text = event["text"].split(">", 1)[-1].strip()  # 先頭の @bot を取り除く
    handle_question(event, client, say, text)


@app.event("message")
def on_dm(event, client, say):
    # DM (channel_type "im") のみ処理し、bot自身の発言は無視
    if event.get("channel_type") != "im" or event.get("bot_id"):
        return
    text = event.get("text", "").strip()
    if not text:
        return
    handle_question(event, client, say, text)


# 要件定義書 F-102: このリアクションを付けたメッセージをタスク化候補として起票する。
TASKIFY_EMOJI = os.getenv("TASKIFY_EMOJI", "memo")

TASKIFY_ROLE = (
    "あなたはSlackメッセージをプロジェクト管理タスクに変換するアシスタントです。"
    "与えられたメッセージ本文を読み、タスクとして登録するための情報をJSONで1つだけ出力してください。"
    "説明文や前置き、コードブロックの``` は付けず、JSONオブジェクトのみを出力してください。\n"
    '形式: {"title": "短いタスク名(20文字程度)", "description": "詳細説明(元の文脈を要約)", '
    '"priority": "高"|"中"|"低", "due_date": "YYYY-MM-DD"または締切が読み取れない場合はnull}'
)


def summarize_task(message_text):
    """F-105: メッセージ本文をClaudeに要約させ、タスクの仮情報(JSON)を作らせる。"""
    prompt = f"{TASKIFY_ROLE}\n\n【メッセージ本文】\n{message_text}"
    answer, _ = ask_claude(prompt, allowed_tools=None)
    try:
        cleaned = answer.strip().strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        data = json.loads(cleaned)
        return {
            "title": (data.get("title") or message_text[:30]).strip(),
            "description": (data.get("description") or message_text).strip(),
            "priority": data.get("priority") if data.get("priority") in ("高", "中", "低") else "中",
            "due_date": data.get("due_date") or None,
        }
    except Exception:
        # AIの出力が壊れていても、元メッセージだけは残してタスク化する(誤検知よりは救済を優先)
        return {"title": message_text[:30].strip(), "description": message_text, "priority": "中", "due_date": None}


def get_message_text(client, channel, ts):
    """反応がついたメッセージの本文を取得する(チャンネル本流／スレッド返信のどちらでも試す)。"""
    try:
        history = client.conversations_history(channel=channel, latest=ts, limit=1, inclusive=True)
        for m in history.get("messages", []):
            if m.get("ts") == ts:
                return m.get("text", "")
    except Exception:
        pass
    try:
        replies = client.conversations_replies(channel=channel, ts=ts, limit=1, inclusive=True)
        for m in replies.get("messages", []):
            if m.get("ts") == ts:
                return m.get("text", "")
    except Exception:
        pass
    return ""


@app.event("reaction_added")
def on_taskify_reaction(event, client):
    if event.get("reaction") != TASKIFY_EMOJI:
        return
    item = event.get("item", {})
    if item.get("type") != "message":
        return

    channel = item["channel"]
    ts = item["ts"]

    project = db.project_by_channel(channel)
    if not project:
        client.chat_postEphemeral(
            channel=channel,
            user=event["user"],
            text="このチャンネルに紐づくプロジェクトが見つかりません。ダッシュボードでプロジェクトの通知先チャンネルIDを設定してください。",
        )
        return

    text = get_message_text(client, channel, ts)
    if not text:
        return

    info = summarize_task(text)
    permalink = None
    try:
        permalink = client.chat_getPermalink(channel=channel, message_ts=ts)["permalink"]
    except Exception:
        pass

    task = db.create_task_from_source(
        project_id=project["id"],
        title=info["title"],
        progress_comment=info["description"],
        priority=info["priority"],
        due_date=info["due_date"],
        source="slack",
        source_url=permalink,
    )
    if not task:
        return

    client.chat_postMessage(
        channel=channel,
        thread_ts=ts,
        text=(
            f"「{info['title']}」を承認待ちタスクとして登録しました（優先度:{info['priority']}）。\n"
            "ダッシュボードのタスク一覧で内容を確認・承認してください。"
        ),
    )


if __name__ == "__main__":
    handler = SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])
    reminder.start(app.client)  # 期日リマインダーを裏で動かし始める
    if os.getenv("AZURE_CLIENT_ID"):
        teams.start(ask_claude)  # Teamsチャンネルのポーリングを裏で動かし始める(F-101/103)
        outlook.start(ask_claude)  # Outlook受信フォルダのポーリングを裏で動かし始める(F-104)
    handler.start()
