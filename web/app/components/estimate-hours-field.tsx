"use client";

import { useState } from "react";

/**
 * 「かかる時間」の入力欄+「AI提案」ボタン。同じ<form>内の name="title" / name="assignee_id"
 * を読んで見積もりAPIを叩き、この欄に反映する(担当者の過去実績を考慮するため回数を重ねるほど精度が上がる)。
 */
export default function EstimateHoursField({
  defaultValue,
  className,
}: {
  defaultValue?: number | string | null;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleEstimate(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    if (!form) return;
    const title = (form.elements.namedItem("title") as HTMLInputElement | null)?.value?.trim();
    const assigneeEl = form.elements.namedItem("assignee_id") as HTMLSelectElement | null;
    const assigneeId = assigneeEl?.value || null;

    if (!title) {
      setError("先にタスク名を入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    setReason(null);
    try {
      const res = await fetch("/api/estimate-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, assigneeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "見積もりに失敗しました");

      const hoursInput = form.elements.namedItem("estimated_hours") as HTMLInputElement | null;
      if (hoursInput) hoursInput.value = String(data.hours);
      setReason(data.reason || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "見積もりに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className ?? "flex flex-col gap-1"}>
      <div className="flex items-center gap-1.5">
        <input
          name="estimated_hours"
          type="number"
          min="0"
          step="0.5"
          defaultValue={defaultValue ?? ""}
          placeholder="かかる時間(h)"
          className="w-28 rounded-[10px] border border-line px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleEstimate}
          disabled={loading}
          title="AIに見積もってもらう(担当者の過去の傾向を考慮)"
          className="whitespace-nowrap rounded-[8px] border border-line px-2.5 py-2 text-[11px] font-bold text-navy disabled:opacity-40"
        >
          {loading ? "見積り中…" : "✨ AI提案"}
        </button>
      </div>
      {reason && <p className="text-[10px] text-muted">理由: {reason}</p>}
      {error && <p className="text-[10px] text-blush">{error}</p>}
    </div>
  );
}
