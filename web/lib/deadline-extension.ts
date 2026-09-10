import "server-only";
import { askClaude } from "./ai/ask";

const ROLE = (
  "あなたはプロジェクト管理アプリのアシスタントです。担当者から期限延長の希望が出ているタスクについて、" +
  "プロジェクト責任者が延長の可否を判断するのを手伝ってください。" +
  "判断基準: 本人の希望日がプロジェクト全体の締切を超えていないか、担当者の他の未完了タスクと日程が" +
  "過密になりすぎないか、担当者の有給休暇予定日と重なっていないかを考慮する。" +
  "希望日どおりの延長が難しい場合でも、単に不可とするのではなく、" +
  "「希望日までは難しいが、この日までなら問題ない」というように、現実的に間に合う代替日を必ず提案してください。\n" +
  "説明文や前置き、コードブロックの``` は付けず、JSONオブジェクトのみを出力してください。\n\n" +
  '出力形式: {"feasible": true|false, "recommended_date": "YYYY-MM-DD", "reason": "40字程度の短い理由"}\n' +
  "- feasible: 希望日どおりに延長しても問題なければtrue、難しければfalse\n" +
  "- recommended_date: feasibleがtrueなら希望日そのもの、falseなら現実的に間に合う代替日(希望日より前)\n" +
  "- reason には、なぜその判断/代替日になったのかが分かる理由を書く"
);

export type OtherTask = {
  title: string;
  due_date: string | null;
  estimated_hours: number | null;
  status: string;
};

export type DeadlineExtensionResult = {
  feasible: boolean;
  recommendedDate: string;
  reason: string;
};

/**
 * 期限延長希望が出ているタスクについて、プロジェクト全体の締切・担当者の他の
 * 未完了タスクを踏まえ、希望どおりの延長が可能か、難しければ代替日をAIに提案させる。
 * 失敗時はnullを返す。
 */
export async function suggestDeadlineExtension(
  taskTitle: string,
  currentDueDate: string | null,
  requestedDueDate: string,
  note: string | null,
  projectDeadline: string | null,
  otherTasks: OtherTask[],
  leaveDays: string[],
  today: Date,
): Promise<DeadlineExtensionResult | null> {
  const todayStr = today.toISOString().slice(0, 10);
  const otherTasksText = otherTasks.length
    ? otherTasks
        .map(
          (t) =>
            `・${t.title}(締切:${t.due_date ?? "未設定"}／見込み${t.estimated_hours ?? "不明"}h／${t.status}）`,
        )
        .join("\n")
    : "(担当者の他の未完了タスクなし)";
  const leaveDaysText = leaveDays.length ? leaveDays.join(", ") : "(登録なし)";

  const context = [
    `今日の日付: ${todayStr}`,
    `タスク名: ${taskTitle}`,
    `現在の締切: ${currentDueDate ?? "未設定"}`,
    `本人希望の新しい締切: ${requestedDueDate}`,
    note ? `本人のコメント: ${note}` : null,
    `プロジェクト全体の締切: ${projectDeadline ?? "未設定"}`,
    `担当者の他の未完了タスク:\n${otherTasksText}`,
    `担当者の有給休暇予定日: ${leaveDaysText}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `${ROLE}\n\n【情報】\n${context}`;

  try {
    const result = await askClaude(prompt);
    const cleaned = result.trim().replace(/^```json?|```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.recommended_date ?? "")) return null;
    return {
      feasible: Boolean(parsed.feasible),
      recommendedDate: parsed.recommended_date,
      reason: String(parsed.reason ?? ""),
    };
  } catch {
    return null;
  }
}
