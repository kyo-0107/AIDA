import { getCurrentUserOrRedirect } from "@/lib/current-user";
import { disconnectGmail, disconnectOutlook, disconnectTeams, updateProfile } from "@/app/actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    teams_connected?: string;
    teams_error?: string;
    outlook_connected?: string;
    outlook_error?: string;
    gmail_connected?: string;
    gmail_error?: string;
  }>;
}) {
  const {
    teams_connected,
    teams_error,
    outlook_connected,
    outlook_error,
    gmail_connected,
    gmail_error,
  } = await searchParams;
  const { supabase, user, displayName } = await getCurrentUserOrRedirect();

  const { data: integrations } = await supabase
    .from("user_integrations")
    .select("provider, account_email")
    .eq("user_id", user.id);

  const teamsIntegration = (integrations ?? []).find((i) => i.provider === "teams") ?? null;
  const outlookIntegration = (integrations ?? []).find((i) => i.provider === "outlook") ?? null;
  const gmailIntegration = (integrations ?? []).find((i) => i.provider === "gmail") ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[18px] bg-surface p-6 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
        <h1 className="mb-4 font-display text-xl font-bold text-navy-deep">自分の設定</h1>

        <div className="mb-4 flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">メールアドレス</span>
          <span className="text-sm font-semibold text-ink">{user.email}</span>
        </div>

        <form action={updateProfile} className="flex flex-col gap-2">
          <label className="text-xs font-bold text-muted">表示名</label>
          <input
            name="display_name"
            defaultValue={displayName}
            required
            className="rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
          />
          <button className="mt-2 self-start rounded-[10px] bg-navy-deep px-5 py-2.5 text-sm font-bold text-gold">
            保存する
          </button>
        </form>

        <hr className="my-6 border-dashed border-line" />

        <h2 className="mb-3 font-display text-[15px] font-bold text-navy-deep">連携アカウント</h2>

        {teams_connected && (
          <p className="mb-3 rounded-[10px] bg-sage/40 px-3 py-2 text-xs font-semibold text-navy-deep">
            Teamsとの連携が完了しました。
          </p>
        )}
        {teams_error && (
          <p className="mb-3 rounded-[10px] bg-blush/20 px-3 py-2 text-xs font-semibold text-blush">
            Teams連携に失敗しました: {teams_error}
          </p>
        )}
        {outlook_connected && (
          <p className="mb-3 rounded-[10px] bg-sage/40 px-3 py-2 text-xs font-semibold text-navy-deep">
            Outlookとの連携が完了しました。
          </p>
        )}
        {outlook_error && (
          <p className="mb-3 rounded-[10px] bg-blush/20 px-3 py-2 text-xs font-semibold text-blush">
            Outlook連携に失敗しました: {outlook_error}
          </p>
        )}
        {gmail_connected && (
          <p className="mb-3 rounded-[10px] bg-sage/40 px-3 py-2 text-xs font-semibold text-navy-deep">
            Gmailとの連携が完了しました。
          </p>
        )}
        {gmail_error && (
          <p className="mb-3 rounded-[10px] bg-blush/20 px-3 py-2 text-xs font-semibold text-blush">
            Gmail連携に失敗しました: {gmail_error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-[12px] border border-line px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">Microsoft Teams</p>
              {teamsIntegration ? (
                <p className="text-xs text-muted">連携済み({teamsIntegration.account_email || "アカウント確認済み"})</p>
              ) : (
                <p className="text-xs text-muted">未連携</p>
              )}
            </div>
            {teamsIntegration ? (
              <form action={disconnectTeams}>
                <button className="rounded-[8px] border border-line px-3 py-1.5 text-xs font-bold text-muted">
                  連携解除
                </button>
              </form>
            ) : (
              <a
                href="/api/integrations/teams/connect"
                className="rounded-[8px] bg-navy-deep px-3.5 py-1.5 text-xs font-bold text-gold"
              >
                連携する
              </a>
            )}
          </div>

          <div className="flex items-center justify-between rounded-[12px] border border-line px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">Outlook</p>
              {outlookIntegration ? (
                <p className="text-xs text-muted">連携済み({outlookIntegration.account_email || "アカウント確認済み"})</p>
              ) : (
                <p className="text-xs text-muted">未連携</p>
              )}
            </div>
            {outlookIntegration ? (
              <form action={disconnectOutlook}>
                <button className="rounded-[8px] border border-line px-3 py-1.5 text-xs font-bold text-muted">
                  連携解除
                </button>
              </form>
            ) : (
              <a
                href="/api/integrations/outlook/connect"
                className="rounded-[8px] bg-navy-deep px-3.5 py-1.5 text-xs font-bold text-gold"
              >
                連携する
              </a>
            )}
          </div>

          <div className="flex items-center justify-between rounded-[12px] border border-line px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">Gmail</p>
              {gmailIntegration ? (
                <p className="text-xs text-muted">連携済み({gmailIntegration.account_email || "アカウント確認済み"})</p>
              ) : (
                <p className="text-xs text-muted">未連携</p>
              )}
            </div>
            {gmailIntegration ? (
              <form action={disconnectGmail}>
                <button className="rounded-[8px] border border-line px-3 py-1.5 text-xs font-bold text-muted">
                  連携解除
                </button>
              </form>
            ) : (
              <a
                href="/api/gmail/connect"
                className="rounded-[8px] bg-navy-deep px-3.5 py-1.5 text-xs font-bold text-gold"
              >
                連携する
              </a>
            )}
          </div>
        </div>

        <p className="mt-2 text-[10.5px] text-muted">
          連携すると、プロジェクト詳細画面でこのアカウントの受信フォルダ/Teamsチャンネル/Gmailの送信者フィルタを
          プロジェクトごとに設定して、タスクの自動検知に使えるようになります
          (検知後は必ず承認待ちになり、内容を確認してから確定します)。
        </p>

        <p className="mt-6 text-xs text-muted">
          負荷スコア(心情的配慮)の表示は今後実装予定です。本人にのみ表示される想定です。
        </p>
      </div>
    </div>
  );
}
