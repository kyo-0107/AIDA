import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

/**
 * ローカル開発用: ログイン済みの `claude` CLI(Claude Code)をサブプロセスとして呼ぶ。
 * Anthropic APIキー不要・課金なし。Node.jsのchild_processに依存するため、
 * Cloudflare Workers(公開環境)では動かない — そちらは claude-api.ts を使う。
 */
export async function askClaudeCli(prompt: string, timeoutMs = 20_000): Promise<string> {
  const { stdout } = await execFileAsync(
    CLAUDE_BIN,
    ["-p", prompt, "--output-format", "json"],
    { timeout: timeoutMs },
  );
  const data = JSON.parse(stdout);
  return String(data.result);
}
