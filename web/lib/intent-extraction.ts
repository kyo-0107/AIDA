import "server-only";
import { askClaude } from "./ai/ask";

function buildRole(today: string) {
  return (
    "あなたはプロジェクト管理アプリのアシスタントです。タスクの「進捗状況・このタスクに関する意見」欄に" +
    "書かれた自由記述を読み、そこに含まれる心情的な訴え(フォロー要請/期限延長希望など)を判定してください。" +
    `今日の日付は ${today} です。相対的な表現(「来週まで」「あと3日」等)や月日だけの表現(「9/20まで」等)は、` +
    "今日の日付を基準にYYYY-MM-DD形式へ変換してください。年が省略されている場合は今日以降で一番近い日付として解釈してください。\n" +
    "説明文や前置き、コードブロックの``` は付けず、JSONオブジェクトのみを出力してください。\n\n" +
    '出力形式: {"intent": "follow_up"|"extend_deadline"|"both"|"none", "note": "20字程度の短い要約", ' +
    '"requested_due_date": "YYYY-MM-DD"または具体的な日付の希望が読み取れない場合はnull}\n' +
    "- follow_up: 自信がない、誰かに手伝ってほしい、フォローしてほしい、不安、といった支援要請\n" +
    "- extend_deadline: 余裕がない、間に合わない、期限を伸ばしてほしい、といった期限緩和の希望\n" +
    "- both: 両方の要素が含まれる場合\n" +
    "- none: 進捗の事実報告のみで、特に配慮すべき訴えが無い場合(自由記述が空/意味のない文字列の場合も含む)\n" +
    "- note は空欄・noneの場合は空文字列にする\n" +
    "- requested_due_date は、本人が「〇月〇日まで」のように具体的な新しい期限を希望している場合だけ設定し、" +
    "「少し伸ばしてほしい」のように曖昧な場合はnullのままにする"
  );
}

export type ExtractedIntent = {
  intent: "follow_up" | "extend_deadline" | "both" | "none";
  note: string;
  requested_due_date: string | null;
};

const INTENT_LABEL: Record<ExtractedIntent["intent"], string> = {
  follow_up: "フォロー要請",
  extend_deadline: "期限延長希望",
  both: "フォロー要請・期限延長希望",
  none: "",
};

export type IntentResult = {
  label: string | null;
  requestedDueDate: string | null;
};

/**
 * 進捗状況コメント(自由記述)から、フォロー要請/期限延長希望などの意図と、
 * 具体的に希望されている期限(あれば)を抽出する(F-202b)。失敗時は両方nullを返す。
 */
export async function extractIntent(comment: string, today: Date): Promise<IntentResult> {
  if (!comment.trim()) return { label: null, requestedDueDate: null };

  const todayStr = today.toISOString().slice(0, 10);
  const prompt = `${buildRole(todayStr)}\n\n【自由記述】\n${comment}`;

  try {
    const result = await askClaude(prompt);
    const cleaned = result.trim().replace(/^```json?|```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as ExtractedIntent;

    if (parsed.intent === "none" || !parsed.intent) return { label: null, requestedDueDate: null };

    const label = INTENT_LABEL[parsed.intent] ?? "";
    const requestedDueDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.requested_due_date ?? "")
      ? parsed.requested_due_date
      : null;

    return {
      label: parsed.note ? `${label}（${parsed.note}）` : label,
      requestedDueDate,
    };
  } catch {
    return { label: null, requestedDueDate: null };
  }
}
