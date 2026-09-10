import "server-only";

/**
 * 公開環境(Cloudflare Workers)用: Anthropic API課金を避けたい場合の選択肢。
 * ローカルPCで動かしている中継サーバー(../../ai-relay/server.mjs、Cloudflare Tunnel経由で
 * 公開URLを持つ)に対してfetchし、そちらで `claude` CLI を実行してもらう。
 * ローカルPC + 中継サーバーが起動している間だけ動く(AI_RELAY_URL/AI_RELAY_SECRETが必要)。
 */
export async function askClaudeRelay(prompt: string): Promise<string> {
  const url = process.env.AI_RELAY_URL;
  const secret = process.env.AI_RELAY_SECRET;
  if (!url || !secret) throw new Error("AI_RELAY_URL / AI_RELAY_SECRET が設定されていません");

  const res = await fetch(`${url.replace(/\/$/, "")}/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`AI中継サーバーの呼び出しに失敗しました: ${await res.text()}`);

  const data = (await res.json()) as { result: string };
  return data.result;
}
