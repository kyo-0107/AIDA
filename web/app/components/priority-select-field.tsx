"use client";

import { useState } from "react";

/**
 * 優先度の選択欄+「AI提案」ボタン。同じ<form>内の name="title" / name="due_date" /
 * name="estimated_hours" を読んで見積もりAPIを叩き、この欄に反映する。
 */
export default function PrioritySelectField({
  defaultValue = "中",
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  const [priority, setPriority] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    if (!form) return;
    const title = (form.elements.namedItem("title") as HTMLInputElement | null)?.value?.trim();
    const dueDate = (form.elements.namedItem("due_date") as HTMLInputElement | null)?.value || null;
    const estimatedHoursRaw = (form.elements.namedItem("estimated_hours") as HTMLInputElement | null)
      ?.value;
    const estimatedHours = estimatedHoursRaw ? Number(estimatedHoursRaw) : null;

    if (!title) {
      setError("先にタスク名を入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    setReason(null);
    try {
      const res = await fetch("/api/suggest-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dueDate, estimatedHours }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "優先度の提案に失敗しました");
      setPriority(data.priority);
      setReason(data.reason || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "優先度の提案に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className ?? "flex flex-col gap-1"}>
      <div className="flex items-center gap-1.5">
        <select
          name="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-[10px] border border-line px-3 py-2 text-sm text-muted"
        >
          <option value="高">高</option>
          <option value="中">中</option>
          <option value="低">低</option>
        </select>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          title="AIに優先度を提案してもらう(締切・所要時間から判断)"
          className="whitespace-nowrap rounded-[8px] border border-line px-2.5 py-2 text-[11px] font-bold text-navy disabled:opacity-40"
        >
          {loading ? "判断中…" : "✨ AI提案"}
        </button>
      </div>
      {reason && <p className="text-[10px] text-muted">理由: {reason}</p>}
      {error && <p className="text-[10px] text-blush">{error}</p>}
    </div>
  );
}
