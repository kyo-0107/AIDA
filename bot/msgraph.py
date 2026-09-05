"""Microsoft Graph(Teams/Outlook)への接続。web/lib/msgraph.ts のPython側対応版。

Bot(このプロセス)は定期ポーリングでチャンネル/メールの新着を取りに行く役目。
OAuth同意・初回のトークン取得はダッシュボード(web/)側が担当し、ここでは
Supabaseに保存済みのトークンを読み書きするだけ。
"""
import os
from datetime import datetime, timedelta, timezone

import requests

TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"

SCOPES_BY_PROVIDER = {
    "teams": "offline_access User.Read Chat.Read ChannelMessage.Read.All Team.ReadBasic.All Channel.ReadBasic.All",
    "outlook": "offline_access User.Read Mail.Read",
}


def _refresh(refresh_token, scopes):
    resp = requests.post(
        TOKEN_ENDPOINT,
        data={
            "client_id": os.environ["AZURE_CLIENT_ID"],
            "client_secret": os.environ["AZURE_CLIENT_SECRET"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": scopes,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get_valid_access_token(sb, user_id, provider):
    """user_integrations(provider)からトークンを取り、期限切れなら更新して返す。未接続ならNone。"""
    row = (
        sb.table("user_integrations")
        .select("access_token, refresh_token, expires_at")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .execute()
        .data
    )
    if not row:
        return None
    integration = row[0]

    expires_at = datetime.fromisoformat(integration["expires_at"].replace("Z", "+00:00"))
    if expires_at - datetime.now(timezone.utc) > timedelta(minutes=2):
        return integration["access_token"]

    refreshed = _refresh(integration["refresh_token"], SCOPES_BY_PROVIDER[provider])
    new_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=refreshed["expires_in"])
    ).isoformat()
    sb.table("user_integrations").update(
        {
            "access_token": refreshed["access_token"],
            "refresh_token": refreshed["refresh_token"],
            "expires_at": new_expires_at,
        }
    ).eq("user_id", user_id).eq("provider", provider).execute()
    return refreshed["access_token"]


def list_channel_messages(access_token, team_id, channel_id, top=50):
    resp = requests.get(
        f"{GRAPH_BASE}/teams/{team_id}/channels/{channel_id}/messages",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"$top": top},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])


def list_folder_messages(access_token, folder_id, top=50):
    resp = requests.get(
        f"{GRAPH_BASE}/me/mailFolders/{folder_id}/messages",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "$top": top,
            "$select": "subject,bodyPreview,body,from,receivedDateTime,webLink",
            "$orderby": "receivedDateTime desc",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])
