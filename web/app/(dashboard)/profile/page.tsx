import { getCurrentUserOrRedirect } from "@/lib/current-user";
import { updateProfile } from "@/app/actions";

export default async function ProfilePage() {
  const { user, displayName } = await getCurrentUserOrRedirect();

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

        <p className="mt-6 text-xs text-muted">
          負荷スコア(心情的配慮)の表示は今後実装予定です。本人にのみ表示される想定です。
        </p>
      </div>
    </div>
  );
}
