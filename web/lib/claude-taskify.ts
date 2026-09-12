import "server-only";
import { askClaude } from "./ai/ask";

export type TaskifyResult = {
  isTask: boolean;
  title: string | null;
  description: string | null;
  priority: "高" | "中" | "低";
  dueDate: string | null; // YYYY-MM-DD
};

// bot/app.py の TASKIFY_ROLE と揃えつつ、Gmailは受信者が明示的にトリガーしていないため
// is_task の判定を追加している(見逃しより誤検知の方が許容範囲、迷ったらtrue側に倒す)。
const ROLE = `あなたはメールをプロジェクト管理タスクに変換するアシスタントです。
与えられたメール本文を読み、対応が必要な課題・タスクかどうかを判定し、タスク化に必要な情報をJSONで1つだけ出力してください。
説明文や前置き、コードブロックの\`\`\`は付けず、JSONオブジェクトのみを出力してください。

形式: {"is_task": boolean, "title": "短いタスク名(20文字程度)"|null, "description": "詳細説明(元の文脈を要約)"|null, "priority": "高"|"中"|"低", "due_date": "YYYY-MM-DD"またはnull}

- is_task: 対応・返信・作業が必要なら true。単なる通知・広告・自動送信メールなど対応不要なら false。
  判断に迷う場合は true 側に倒す(見逃しより誤検知の方が許容範囲)。
- is_task が false の場合、title と description は null にする。
- due_date は本文から読み取れる期限があれば YYYY-MM-DD 形式。読み取れなければ null。
- メール本文に含まれない情報を推測で補わないこと。`;

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) return trimmed;
  return trimmed.slice(start, end + 1);
}

export async function taskifyEmail(bodyText: string): Promise<TaskifyResult> {
  const prompt = `${ROLE}\n\n以下はメールの本文です。判定してください。\n\n---\n${bodyText.slice(0, 8000)}\n---`;

  let result: string;
  try {
    result = await askClaude(prompt);
  } catch (err: unknown) {
    throw new Error(`AI呼び出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(extractJson(result));
  } catch {
    throw new Error(`AI応答をJSONとして解釈できませんでした: ${result.slice(0, 300)}`);
  }

  return {
    isTask: Boolean(parsed.is_task),
    title: parsed.title ?? null,
    description: parsed.description ?? null,
    priority: ["高", "中", "低"].includes(parsed.priority) ? parsed.priority : "中",
    dueDate: parsed.due_date ?? null,
  };
}
