import "server-only";
import { askClaude } from "./ai/ask";

const ROLE = (
  "あなたはプロジェクト管理アプリのアシスタントです。タスクの優先度(高/中/低)を判断してください。" +
  "判断基準: 締切までの日数が短いほど優先度は上がる。所要見込み時間が長いのに締切が近いと更に上がる。" +
  "締切が無い、または遠く、所要時間も短いタスクは優先度が下がる。タスク名から緊急性・重要性が" +
  "読み取れる場合(例:「提出」「至急」「締切」等)も考慮する。" +
  "依頼元が分かっている場合、重要な取引先・クライアントからの依頼と読み取れるときは優先度を上げる材料にする。\n" +
  "説明文や前置き、コードブロックの``` は付けず、JSONオブジェクトのみを出力してください。\n\n" +
  '出力形式: {"priority": "高"|"中"|"低", "reason": "20字程度の短い理由"}'
);

export type PriorityResult = { priority: "高" | "中" | "低"; reason: string };

/**
 * タスク名・締切・所要見込み時間・依頼元から、優先度(高/中/低)をAIに提案させる。
 * 失敗時はnullを返す。
 */
export async function suggestPriority(
  title: string,
  dueDate: string | null,
  estimatedHours: number | null,
  requester: string | null,
  today: Date,
): Promise<PriorityResult | null> {
  if (!title.trim()) return null;

  const todayStr = today.toISOString().slice(0, 10);
  const daysUntilDue = dueDate
    ? Math.ceil((new Date(`${dueDate}T00:00:00`).getTime() - today.getTime()) / 86_400_000)
    : null;

  const context = [
    `タスク名: ${title}`,
    `今日の日付: ${todayStr}`,
    dueDate ? `締切: ${dueDate}（今日から${daysUntilDue}日後）` : "締切: 未設定",
    estimatedHours != null ? `所要見込み時間: ${estimatedHours}時間` : "所要見込み時間: 未設定",
    requester ? `依頼元: ${requester}` : "依頼元: 未設定",
  ].join("\n");

  const prompt = `${ROLE}\n\n【タスク情報】\n${context}`;

  try {
    const result = await askClaude(prompt);
    const cleaned = result.trim().replace(/^```json?|```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!["高", "中", "低"].includes(parsed.priority)) return null;
    return { priority: parsed.priority, reason: String(parsed.reason ?? "") };
  } catch {
    return null;
  }
}
