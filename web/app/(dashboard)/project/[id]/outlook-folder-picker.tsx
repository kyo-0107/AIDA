"use client";

import { useState, useTransition } from "react";
import { setProjectOutlookFolder, toggleProjectIntegration } from "@/app/actions";

type Folder = { id: string; name: string };

export default function OutlookFolderPicker({
  projectId,
  current,
}: {
  projectId: number;
  current: { channel_name: string | null; enabled: boolean } | null;
}) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [isPending, startTransition] = useTransition();

  const setWithId = setProjectOutlookFolder.bind(null, projectId);
  const folder = folders?.find((f) => f.id === folderId);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/outlook/folders");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "読み込みに失敗しました");
      setFolders(data.folders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-line p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Outlook連携</p>
        {current && (
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <input
              type="checkbox"
              checked={current.enabled}
              disabled={isPending}
              onChange={(e) => {
                const next = e.target.checked;
                startTransition(() => {
                  toggleProjectIntegration(projectId, "outlook", next);
                });
              }}
            />
            有効
          </label>
        )}
      </div>

      {current ? (
        <p className="text-xs text-muted">現在の設定: {current.channel_name}</p>
      ) : (
        <p className="text-xs text-muted">未設定</p>
      )}

      {folders === null ? (
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="mt-2 rounded-[8px] bg-line/60 px-3 py-1.5 text-xs font-bold text-navy"
        >
          {loading ? "読み込み中…" : "フォルダを選び直す"}
        </button>
      ) : (
        <form action={setWithId} className="mt-2 flex flex-col gap-2">
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="rounded-[8px] border border-line px-2.5 py-1.5 text-xs"
          >
            <option value="">フォルダを選択</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="folder_id" value={folderId} />
          <input type="hidden" name="folder_name" value={folder?.name ?? ""} />

          <button
            disabled={!folderId}
            className="self-start rounded-[8px] bg-navy-deep px-3.5 py-1.5 text-xs font-bold text-gold disabled:opacity-40"
          >
            この設定を保存
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-[10.5px] font-semibold text-blush">{error}</p>}
    </div>
  );
}
