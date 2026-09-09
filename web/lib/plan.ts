export type PlanTask = {
  id: number;
  title: string;
  priority: string;
  due_date: string | null;
  estimated_hours: number | null;
  planned_start_date: string | null;
  project_id: number;
  extracted_intent?: string | null;
  requested_due_date?: string | null;
};

const HOURS_PER_DAY = 6; // 1日に確保できる想定作業時間(目安)
const EXTENSION_BUFFER_DAYS = 2; // 具体的な希望日が読み取れなかったときの、期限延長希望への目安の後ろ倒し日数

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * F-201/204: 締切・所要見込み時間から「着手すべき日」を提案し、その理由を添える。
 * F-202/202b: 進捗コメントからAIが抽出した意図(フォロー要請/期限延長希望、tasks.extracted_intent)と、
 * 本人が具体的に希望していた期限(tasks.requested_due_date)を判断材料に反映する
 * (F-202自体の自由記述解釈は保存時に済んでおり、ここではその結果を読むだけ)。
 */
export function suggestStartDate(task: PlanTask, today: Date) {
  const intent = task.extracted_intent ?? "";
  const wantsExtension = intent.includes("期限延長希望");
  const wantsFollowUp = intent.includes("フォロー要請");

  if (!task.due_date) {
    return { suggestedStart: null, reason: "締切が未設定のため提案できません" };
  }

  const originalDue = new Date(`${task.due_date}T00:00:00`);
  // 本人が具体的な期限を希望していれば、その日付を実質的な締切として計算する
  const effectiveDue =
    wantsExtension && task.requested_due_date
      ? new Date(`${task.requested_due_date}T00:00:00`)
      : originalDue;

  const leadDays = task.estimated_hours
    ? Math.max(1, Math.ceil(task.estimated_hours / HOURS_PER_DAY))
    : 1;

  const suggested = new Date(effectiveDue);
  suggested.setDate(suggested.getDate() - (leadDays - 1));
  if (wantsExtension && !task.requested_due_date) {
    // 具体的な希望日が読み取れなかった場合だけ、目安として後ろ倒しにする
    suggested.setDate(suggested.getDate() + EXTENSION_BUFFER_DAYS);
  }

  let reason: string;
  if (wantsExtension && task.requested_due_date) {
    reason = `本人が${task.requested_due_date}までの延長を希望しています。その期限に合わせて着手日を調整しました`;
  } else if (wantsExtension) {
    reason = "本人から期限延長の希望が出ています。急がせず、期限の見直しを検討してください";
  } else if (originalDue < today) {
    reason = "締切を過ぎているため今すぐ着手";
  } else if (suggested <= today) {
    reason = task.estimated_hours
      ? `見込み${task.estimated_hours}時間で締切に間に合わせるため、今日から着手`
      : "締切が近いため今日から着手";
  } else if (task.priority === "高") {
    reason = "優先度が高いため早めに着手";
  } else {
    reason = task.estimated_hours
      ? `見込み${task.estimated_hours}時間かかるため、締切から逆算して着手`
      : "締切に間に合うよう順番どおりに配置";
  }

  if (wantsFollowUp) {
    reason += "／サポートが必要そうです。誰かに手伝いを打診すると良いかもしれません";
  }

  const clampedStart = suggested < today ? today : suggested;
  return { suggestedStart: dateKey(clampedStart), reason };
}
