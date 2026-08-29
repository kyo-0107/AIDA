export type PlanTask = {
  id: number;
  title: string;
  priority: string;
  due_date: string | null;
  estimated_hours: number | null;
  planned_start_date: string | null;
  project_id: number;
};

const HOURS_PER_DAY = 6; // 1日に確保できる想定作業時間(目安)

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * F-201/204: 締切・所要見込み時間から「着手すべき日」を提案し、その理由を添える。
 * 本物のAI(心情配慮・自由記述の解釈)はまだ繋がっていないルールベースの仮ロジック。
 */
export function suggestStartDate(task: PlanTask, today: Date) {
  if (!task.due_date) {
    return { suggestedStart: null, reason: "締切が未設定のため提案できません" };
  }

  const due = new Date(`${task.due_date}T00:00:00`);
  const leadDays = task.estimated_hours
    ? Math.max(1, Math.ceil(task.estimated_hours / HOURS_PER_DAY))
    : 1;

  const suggested = new Date(due);
  suggested.setDate(suggested.getDate() - (leadDays - 1));

  let reason: string;
  if (due < today) {
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

  const clampedStart = suggested < today ? today : suggested;
  return { suggestedStart: dateKey(clampedStart), reason };
}
