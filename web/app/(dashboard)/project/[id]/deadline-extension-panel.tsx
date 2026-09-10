"use client";

import { useState } from "react";
import { extendTaskDueDate } from "@/app/actions";

export type ExtensionCandidate = {
  id: number;
  title: string;
  due_date: string | null;
  requested_due_date: string;
  progress_comment: string | null;
  assignee: string;
};

/**
 * プロジェクト責任者だけに見える、期限延長リクエストの一覧・判断パネル。
 * メンバーが「このタスクに関する意見」で期限延長を希望し、AIが具体的な希望日を
 * 読み取れたタスクだけを候補として表示する。
 */
export default function DeadlineExtensionPanel({
  projectId,
  tasks,
}: {
  projectId: number;
  tasks: ExtensionCandidate[];
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="rounded-[18px] border border-plum/20 bg-plum/5 p-5 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg leading-none">🧡</span>
        <h2 className="font-display text-[15px] font-bold text-navy-deep">期限延長リクエスト</h2>
        <span className="rounded-full bg-plum/15 px-2 py-0.5 text-[9.5px] font-bold text-plum">SOSを拾うAI</span>
      </div>
      <p className="mb-3 text-[11px] text-muted">
        メンバーから期限延長の希望が出ているタスクです。AIの提案を参考に、責任者として延長するか判断してください。
      </p>
      <div className="flex flex-col gap-3">
        {tasks.map((t) => (
          <ExtensionRow key={t.id} projectId={projectId} task={t} />
        ))}
      </div>
    </div>
  );
}

function ExtensionRow({ projectId, task }: { projectId: number; task: ExtensionCandidate }) {
  const [newDate, setNewDate] = useState(task.requested_due_date);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{ feasible: boolean; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/suggest-deadline-extension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提案の生成に失敗しました");
      setNewDate(data.recommendedDate);
      setSuggestion({ feasible: data.feasible, reason: data.reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "提案の生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const extendWithIds = extendTaskDueDate.bind(null, projectId, task.id);

  return (
    <div className="rounded-[12px] border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-sm font-bold text-ink">{task.title}</p>
        <span className="text-[10.5px] text-muted">担当: {task.assignee}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        現在の締切: {task.due_date ?? "未設定"} ／ 本人希望: {task.requested_due_date}
      </p>
      {task.progress_comment && (
        <p className="mt-1 rounded-[8px] bg-line/40 p-2 text-[11px] text-ink">「{task.progress_comment}」</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          className="whitespace-nowrap rounded-[8px] border border-line px-2.5 py-1.5 text-[11px] font-bold text-navy disabled:opacity-40"
        >
          {loading ? "判断中…" : "✨ AIに延長可否を提案してもらう"}
        </button>
        <form action={extendWithIds} className="flex items-center gap-1.5">
          <input
            name="new_due_date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
            className="rounded-[10px] border border-line px-3 py-1.5 text-sm"
          />
          <button className="whitespace-nowrap rounded-[8px] bg-navy-deep px-3 py-1.5 text-[11px] font-bold text-gold">
            この日で延長する
          </button>
        </form>
      </div>

      {suggestion && (
        <p className={`mt-1.5 text-[11px] font-semibold ${suggestion.feasible ? "text-teal" : "text-blush"}`}>
          {suggestion.feasible ? "✓ 希望日どおり延長可能: " : "△ 希望日どおりは難しい: "}
          {suggestion.reason}
          <span className="ml-1 font-normal text-muted">
            (AIによる下書きの提案です。日付は自由に書き換えたうえで「延長する」を押してください)
          </span>
        </p>
      )}
      {error && <p className="mt-1.5 text-[11px] text-blush">{error}</p>}
    </div>
  );
}
