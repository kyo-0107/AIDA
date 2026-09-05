"use client";

import { useTransition } from "react";
import { setProjectGmailFilter, toggleProjectIntegration } from "@/app/actions";

export default function GmailFilterPicker({
  projectId,
  current,
  connected,
}: {
  projectId: number;
  current: { sender_filter: string | null; enabled: boolean } | null;
  connected: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const setWithId = setProjectGmailFilter.bind(null, projectId);

  if (!connected) {
    return (
      <div className="rounded-[12px] border border-line p-3.5">
        <p className="text-sm font-bold text-ink">Gmail連携</p>
        <p className="mt-1 text-xs text-muted">
          Gmailアカウントが未接続です。「自分の設定」画面から先に連携してください。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-line p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Gmail連携</p>
        {current && (
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <input
              type="checkbox"
              checked={current.enabled}
              disabled={isPending}
              onChange={(e) => {
                const next = e.target.checked;
                startTransition(() => {
                  toggleProjectIntegration(projectId, "gmail", next);
                });
              }}
            />
            有効
          </label>
        )}
      </div>

      <form action={setWithId} className="flex flex-col gap-2">
        <input
          name="sender_filter"
          defaultValue={current?.sender_filter ?? ""}
          placeholder="監視する送信者アドレス(カンマ区切り、空欄なら全件対象)"
          className="rounded-[8px] border border-line px-2.5 py-1.5 text-xs"
        />
        <button className="self-start rounded-[8px] bg-navy-deep px-3.5 py-1.5 text-xs font-bold text-gold">
          この設定を保存
        </button>
      </form>
    </div>
  );
}
