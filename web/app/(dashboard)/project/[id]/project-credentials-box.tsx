"use client";

import { useState } from "react";

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない(手動選択でコピーしてもらう)
    }
  }

  return (
    <button onClick={copy} className="flex items-center gap-2 rounded-[12px] bg-white/15 px-4 py-2.5 text-left">
      <span className="text-[10px] font-bold text-white/60">{label}</span>
      <span className="font-display text-base font-bold tracking-[0.15em] text-gold">{value}</span>
      <span className="text-[10px] font-bold text-white/70">{copied ? "コピーしました" : "タップでコピー"}</span>
    </button>
  );
}

export default function ProjectCredentialsBox({ id, password }: { id: number; password: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <CopyChip label="番号" value={String(id)} />
      <CopyChip label="パスワード" value={password} />
    </div>
  );
}
