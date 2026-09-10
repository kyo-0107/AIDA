import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = process.env.PORT || 8787;
const SECRET = process.env.AI_RELAY_SECRET;
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

if (!SECRET) {
  console.error("AI_RELAY_SECRET が設定されていません。起動を中止します。");
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/ask") {
    res.writeHead(404).end();
    return;
  }
  if (req.headers["authorization"] !== `Bearer ${SECRET}`) {
    res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { prompt } = JSON.parse(body || "{}");
      if (typeof prompt !== "string" || !prompt.trim()) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "prompt is required" }));
        return;
      }
      const { stdout } = await execFileAsync(
        CLAUDE_BIN,
        ["-p", prompt, "--output-format", "json"],
        { timeout: 25_000 },
      );
      const data = JSON.parse(stdout);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result: String(data.result) }));
    } catch (err) {
      console.error("[ai-relay] error:", err);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[ai-relay] listening on http://localhost:${PORT} (POST /ask)`);
});
