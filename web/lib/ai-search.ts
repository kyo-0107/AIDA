import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

const ROLE = (
  "あなたはプロジェクト管理アプリの検索アシスタントです。ユーザーの検索キーワードと、" +
  "プロジェクト一覧(id・名前・概要)をもとに、関連度が高い順にプロジェクトのidだけを" +
  'JSON配列で出力してください。例: [3, 1, 5]\n' +
  "説明文や前置き、コードブロックの``` は付けず、JSON配列のみを出力してください。" +
  "キーワードが日本語の自然文(例:「遅れてるプロジェクト」「AI関連」)でも、名前・概要の内容から意味的に判断してください。" +
  "関連するプロジェクトが無ければ空配列 [] を返してください。"
);

type SearchableProject = { id: number; name: string; summary: string | null };

/**
 * 検索ボックスの自然文クエリを Claude Code CLI(`claude -p`)に投げて、
 * 関連度順のプロジェクトid配列を返す。Anthropic APIキーは使わない(課金なし)。
 * 失敗・タイムアウト時は null を返すので、呼び出し側は単純な部分一致にフォールバックすること。
 */
export async function aiRankProjects(
  query: string,
  projects: SearchableProject[],
): Promise<number[] | null> {
  if (!query.trim() || projects.length === 0) return null;

  const prompt =
    `${ROLE}\n\n【プロジェクト一覧】\n` +
    JSON.stringify(projects) +
    `\n\n【検索キーワード】\n${query}`;

  try {
    const { stdout } = await execFileAsync(
      CLAUDE_BIN,
      ["-p", prompt, "--output-format", "json"],
      { timeout: 20_000 },
    );
    const data = JSON.parse(stdout);
    const cleaned = String(data.result).trim().replace(/^```json?|```$/g, "").trim();
    const ids = JSON.parse(cleaned);
    if (!Array.isArray(ids)) return null;
    const validIds = new Set(projects.map((p) => p.id));
    return ids.filter((id): id is number => typeof id === "number" && validIds.has(id));
  } catch {
    return null;
  }
}
