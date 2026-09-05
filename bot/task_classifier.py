"""メッセージ/メール本文を読み、タスク化すべきかどうかをAIに判定させる共通ロジック(F-101/103/104)。

Teams・Outlookのポーリングから共通で使う。判定にはClaude CLI(ask_claude、Anthropic APIキー不要)を使う。
"""
import json
import re

CLASSIFY_ROLE = (
    "あなたは業務連絡の本文を読み、プロジェクト管理タスクとして起票すべきか判定するアシスタントです。"
    "与えられた本文を読み、依頼・課題・締切のある業務に該当するかを判断してください。"
    "該当する場合のみ、タスク化のための情報をJSONで1つ出力してください。該当しない場合(雑談・相槌・広告メール等)は"
    '{"is_task": false} だけを出力してください。\n'
    "説明文や前置き、コードブロックの``` は付けず、JSONオブジェクトのみを出力してください。\n"
    '該当する場合の形式: {"is_task": true, "title": "短いタスク名(20文字程度)", '
    '"description": "詳細説明(元の文脈を要約)", "priority": "高"|"中"|"低", '
    '"due_date": "YYYY-MM-DD"または締切が読み取れない場合はnull}'
)


def strip_html(html):
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def classify(ask_claude, text):
    prompt = f"{CLASSIFY_ROLE}\n\n【本文】\n{text}"
    answer, _ = ask_claude(prompt, allowed_tools=None)
    try:
        cleaned = answer.strip().strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        data = json.loads(cleaned)
        if not data.get("is_task"):
            return None
        return {
            "title": (data.get("title") or text[:30]).strip(),
            "description": (data.get("description") or text).strip(),
            "priority": data.get("priority") if data.get("priority") in ("高", "中", "低") else "中",
            "due_date": data.get("due_date") or None,
        }
    except Exception:
        return None
