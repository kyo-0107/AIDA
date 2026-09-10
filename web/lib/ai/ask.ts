import "server-only";
import { askClaudeCli } from "./claude-cli";
import { askClaudeApi } from "./claude-api";
import { askClaudeRelay } from "./claude-relay";

/**
 * AI呼び出しの入口。3つのバックエンドを切り替えられる:
 * - "cli": ローカル開発用。`claude` CLI(無料・ログイン済みのClaude Code)を直接呼ぶ。
 * - "relay": 公開環境(Cloudflare Workers)用。ローカルPCで動かす中継サーバー
 *   (../../ai-relay/server.mjs、Cloudflare Tunnel経由)に丸投げし、そちらでCLIを実行してもらう。
 *   API課金なしで公開サイトからも使えるが、ローカルPC+中継サーバーが起動中の間だけ動く。
 * - "api": Anthropic APIを直接叩く。ローカルPCに依存せず常時動くが、従量課金が発生する。
 *
 * 切り替えは環境変数 AI_BACKEND="cli"|"relay"|"api" で明示指定する。
 * 未指定時は AI_RELAY_URL があれば relay、無ければ ANTHROPIC_API_KEY の有無で api/cli を自動判定する。
 */
export async function askClaude(prompt: string): Promise<string> {
  const backend =
    process.env.AI_BACKEND ||
    (process.env.AI_RELAY_URL ? "relay" : process.env.ANTHROPIC_API_KEY ? "api" : "cli");

  if (backend === "relay") return askClaudeRelay(prompt);
  if (backend === "api") return askClaudeApi(prompt);
  return askClaudeCli(prompt);
}
