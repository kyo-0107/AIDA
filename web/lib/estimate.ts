import "server-only";
import { askClaude } from "./ai/ask";

const ROLE = (
  "あなたはプロジェクト管理アプリのアシスタントです。新しいタスクの所要時間(時間単位)を見積もってください。" +
  "担当者の過去のタスク実績(タイトル・実際にかかった時間・進捗コメント)が渡されている場合は、" +
  "そこから読み取れる得意/不得意の傾向(苦手で時間がかかる分野、得意で早く終わる分野 等)を考慮し、" +
  "新しいタスクがそれに近い内容なら見積もりを調整してください。実績データが無い場合は、" +
  "タスク名から一般的に妥当な時間を見積もってください。\n" +
  "説明文や前置き、コードブロックの``` は付けず、JSONオブジェクトのみを出力してください。\n\n" +
  '出力形式: {"hours": 数値(0.5刻み推奨、1〜40の範囲を目安にする), "reason": "20字程度の短い理由"}'
);

export type PastTask = {
  title: string;
  estimated_hours: number | null;
  progress_comment: string | null;
};

export type EstimateResult = { hours: number; reason: string };

/**
 * タスク名と担当者の過去実績から、所要時間(時間単位)をAIに見積もらせる。失敗時はnullを返す。
 */
export async function suggestEstimatedHours(
  title: string,
  pastTasks: PastTask[],
): Promise<EstimateResult | null> {
  if (!title.trim()) return null;

  const historyText = pastTasks.length
    ? pastTasks
        .map((t) => {
          const hours = t.estimated_hours != null ? `${t.estimated_hours}h` : "不明";
          const comment = t.progress_comment ? `／コメント: ${t.progress_comment}` : "";
          return `- ${t.title}（実績: ${hours}${comment}）`;
        })
        .join("\n")
    : "(過去の実績データなし)";

  const prompt = `${ROLE}\n\n【新しいタスク】\n${title}\n\n【担当者の過去のタスク実績(最新${pastTasks.length}件)】\n${historyText}`;

  try {
    const result = await askClaude(prompt);
    const cleaned = result.trim().replace(/^```json?|```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const hours = Number(parsed.hours);
    if (!Number.isFinite(hours) || hours <= 0) return null;
    return { hours: Math.round(hours * 2) / 2, reason: String(parsed.reason ?? "") };
  } catch {
    return null;
  }
}
