"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setMessage({
      type: "success",
      text: "確認メールを送信しました。メール内のリンクを開いてからログインしてください。",
    });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 15% 15%, var(--color-blush) 0%, transparent 42%), radial-gradient(circle at 85% 85%, var(--color-indigo) 0%, transparent 45%), radial-gradient(circle at 85% 10%, var(--color-gold) 0%, transparent 35%)",
        }}
      />

      <div className="relative w-full max-w-sm rounded-[22px] border border-line bg-surface p-10 shadow-[0_30px_60px_-18px_oklch(20%_0.08_275_/_0.35)]">
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-deep to-indigo shadow-[0_10px_20px_-8px_oklch(28%_0.09_275_/_0.6)]">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-gold)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M8 2v4M16 2v4M3 10h18" />
              <path d="M8.5 15l2 2 4-4" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-navy-deep">AIDA</h1>
          <p className="text-xs font-semibold text-muted">
            マルチツール タスク統合 & AIプロジェクト計画支援
          </p>
          <p className="text-center text-[11px] leading-relaxed text-muted">
            複数ツールに散らばりがちなタスクを持つ、少人数のチーム・プロジェクト向け。
            <br />
            AIの提案は下書きです。必ず人が内容を確認・承認してから反映されます。
          </p>
        </div>

        <div className="mb-6 flex gap-2 rounded-lg bg-line/60 p-1">
          <button
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
              mode === "login" ? "bg-white text-navy-deep shadow-sm" : "text-muted"
            }`}
            onClick={() => setMode("login")}
          >
            ログイン
          </button>
          <button
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
              mode === "signup" ? "bg-white text-navy-deep shadow-sm" : "text-muted"
            }`}
            onClick={() => setMode("signup")}
          >
            新規登録
          </button>
        </div>

        <form
          onSubmit={mode === "login" ? handleLogin : handleSignup}
          className="flex flex-col gap-3.5"
        >
          {mode === "signup" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                表示名
              </span>
              <input
                className="rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              メールアドレス
            </span>
            <input
              className="rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              パスワード
            </span>
            <input
              className="rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          {message && (
            <p
              className={`text-sm font-medium ${
                message.type === "error" ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-gradient-to-r from-navy-deep via-navy to-indigo py-3 text-sm font-bold tracking-wide text-gold shadow-[0_14px_24px_-10px_oklch(28%_0.09_275_/_0.55)] disabled:opacity-50"
          >
            {loading ? "処理中…" : mode === "login" ? "ログインする" : "登録する"}
          </button>
        </form>
      </div>
    </div>
  );
}
