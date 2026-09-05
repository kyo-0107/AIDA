import "server-only";
import crypto from "node:crypto";

// Gmail連携のOAuthトークンを AES-256-GCM で暗号化して保存するためのユーティリティ。
// task-hub-app の src/lib/crypto.ts を移植。
// ENCRYPTION_KEY は `openssl rand -hex 32` で生成した64桁の16進文字列。

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY が未設定、または不正です。`openssl rand -hex 32` で生成した64桁の16進文字列を .env.local に設定してください。"
    );
  }
  return Buffer.from(hex, "hex");
}

// 出力形式: base64(iv):base64(authTag):base64(ciphertext)
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("暗号化データの形式が不正です");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
