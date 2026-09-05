"use client";

import { useState, useTransition } from "react";
import { setProjectTeamsChannel, toggleProjectIntegration } from "@/app/actions";

type Channel = { id: string; name: string };
type Team = { teamId: string; teamName: string; channels: Channel[] };

export default function TeamsChannelPicker({
  projectId,
  current,
}: {
  projectId: number;
  current: { channel_name: string | null; enabled: boolean } | null;
}) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [isPending, startTransition] = useTransition();

  const setWithId = setProjectTeamsChannel.bind(null, projectId);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/teams/channels");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "読み込みに失敗しました");
      setTeams(data.teams);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const selectedTeam = teams?.find((t) => t.teamId === selectedTeamId);

  return (
    <div className="rounded-[12px] border border-line p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Microsoft Teams連携</p>
        {current && (
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <input
              type="checkbox"
              checked={current.enabled}
              disabled={isPending}
              onChange={(e) => {
                const next = e.target.checked;
                startTransition(() => {
                  toggleProjectIntegration(projectId, "teams", next);
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

      {teams === null ? (
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="mt-2 rounded-[8px] bg-line/60 px-3 py-1.5 text-xs font-bold text-navy"
        >
          {loading ? "読み込み中…" : "チームを選び直す"}
        </button>
      ) : (
        <form action={setWithId} className="mt-2 flex flex-col gap-2">
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="rounded-[8px] border border-line px-2.5 py-1.5 text-xs"
          >
            <option value="">チームを選択</option>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.teamName}
              </option>
            ))}
          </select>
          <input type="hidden" name="team_id" value={selectedTeamId} />
          <input type="hidden" name="team_name" value={selectedTeam?.teamName ?? ""} />

          {selectedTeam && (
            <ChannelSelect channels={selectedTeam.channels} />
          )}

          <button
            disabled={!selectedTeamId}
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

function ChannelSelect({ channels }: { channels: Channel[] }) {
  const [channelId, setChannelId] = useState("");
  const channel = channels.find((c) => c.id === channelId);
  return (
    <>
      <select
        value={channelId}
        onChange={(e) => setChannelId(e.target.value)}
        className="rounded-[8px] border border-line px-2.5 py-1.5 text-xs"
      >
        <option value="">チャンネルを選択</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input type="hidden" name="channel_id" value={channelId} />
      <input type="hidden" name="channel_name" value={channel?.name ?? ""} />
    </>
  );
}
