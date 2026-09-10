import "server-only";

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * 公開環境(Cloudflare Workers)用: Anthropic APIを直接fetchで呼ぶ。
 * Node.jsのchild_processが使えないWorkers上でも動く。ANTHROPIC_API_KEYが必要(課金あり)。
 */
export async function askClaudeApi(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API呼び出しに失敗しました: ${await res.text()}`);

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  return text;
}
