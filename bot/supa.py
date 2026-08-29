"""Supabase クライアントの生成をまとめるモジュール。

2種類のキーを使い分ける:
- SUPABASE_KEY (publishable/anon)  … ダッシュボードのログイン済みユーザー操作。RLS が効く
- SUPABASE_SERVICE_KEY (secret/service_role) … Slack Bot・リマインダー用。RLS を無視して全件アクセスできる

SUPABASE_SERVICE_KEY は絶対にブラウザに渡るコードや公開リポジトリに含めないこと。
"""
import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()


def anon_client():
    """ログイン中ユーザーの権限で操作するクライアント(RLSが効く)。"""
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def admin_client():
    """サーバー側の信頼された処理専用クライアント(RLSを無視する)。"""
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
