"use client";

import Link from "next/link";
import { useTransition } from "react";
import { reviewTask, toggleTaskStatus } from "@/app/actions";

const PRIORITY_STYLE: Record<string, string> = {
  高: "bg-blush/20 text-blush",
  中: "bg-gold/25 text-navy-deep",
  低: "bg-line text-muted",
};

export default function TaskRow({
  projectId,
  projectName,
  taskId,
  title,
  progressComment,
  extractedIntent,
  requester,
  priority,
  assignee,
  dueDate,
  estimatedHours,
  status,
  source,
  sourceUrl,
  approvalStatus,
}: {
  projectId: number;
  projectName?: string;
  taskId: number;
  title: string;
  progressComment: string | null;
  extractedIntent?: string | null;
  requester?: string | null;
  priority: string;
  assignee: string;
  dueDate: string | null;
  estimatedHours: number | null;
  status: string;
  source: string;
  sourceUrl: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
}) {
  const [isPending, startTransition] = useTransition();
  const done = status === "完了";
  const awaitingReview = approvalStatus === "pending";

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl px-2 py-2.5 text-sm hover:bg-line/30 ${
        done ? "opacity-55" : ""
      } ${awaitingReview ? "bg-gold/10" : ""}`}
    >
      <div className="flex items-center gap-3">
        <label className="relative flex h-[21px] w-[21px] shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={done}
            disabled={isPending || awaitingReview}
            onChange={(e) => {
              const next = e.target.checked;
              startTransition(() => {
                toggleTaskStatus(projectId, taskId, next);
              });
            }}
            className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
          />
          <span
            className={`flex h-full w-full items-center justify-center rounded-[7px] border-2 ${
              done
                ? "border-transparent bg-gradient-to-br from-navy to-indigo"
                : "border-line bg-transparent"
            }`}
          >
            {done && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </span>
        </label>
        <Link
          href={`/project/${projectId}/task/${taskId}`}
          className={`flex-1 truncate font-medium text-ink hover:underline ${done ? "line-through text-muted" : ""}`}
        >
          {title}
        </Link>
        {projectName && (
          <span className="whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-[9.5px] font-bold text-navy">
            {projectName}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["中"]}`}>
          {priority}
        </span>
        {estimatedHours != null && (
          <span className="whitespace-nowrap text-[10.5px] font-semibold text-muted">{estimatedHours}h</span>
        )}
        <span className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-gradient-to-br from-navy to-blush text-[10.5px] font-bold text-white">
          {assignee.slice(0, 1)}
        </span>
        {!done && (
          <span className="w-16 text-center text-[10.5px] font-bold text-navy">{status}</span>
        )}
        <span className="w-20 text-right text-xs font-semibold text-muted">{dueDate || "―"}</span>
      </div>

      {(progressComment || sourceUrl || awaitingReview || extractedIntent || requester) && (
        <div className="ml-9 flex flex-col gap-1.5">
          {progressComment && <p className="text-xs text-muted">{progressComment}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {extractedIntent && (
              <span className="rounded-full bg-plum/15 px-2 py-0.5 text-[9.5px] font-bold text-plum">
                {extractedIntent}
              </span>
            )}
            {requester && (
              <span className="rounded-full bg-plum/15 px-2 py-0.5 text-[9.5px] font-bold text-plum">
                依頼元: {requester}
              </span>
            )}
            {source !== "manual" && (
              <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[9.5px] font-bold text-navy">
                情報元: {source === "slack" ? "Slack" : source}
              </span>
            )}
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10.5px] font-bold text-indigo underline"
              >
                元メッセージを見る ↗
              </a>
            )}
            {awaitingReview && (
              <span
                title="AIによる下書きの提案です。内容を確認したうえで承認/却下してください"
                className="rounded-full bg-gold px-2.5 py-0.5 text-[9.5px] font-bold text-navy-deep"
              >
                承認待ち
              </span>
            )}
            {awaitingReview && (
              <div className="ml-auto flex gap-1.5">
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => {
                      reviewTask(projectId, taskId, "approved");
                    })
                  }
                  className="rounded-[8px] bg-navy-deep px-3 py-1 text-[11px] font-bold text-gold"
                >
                  承認
                </button>
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => {
                      reviewTask(projectId, taskId, "rejected");
                    })
                  }
                  className="rounded-[8px] border border-line px-3 py-1 text-[11px] font-bold text-muted"
                >
                  却下
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
