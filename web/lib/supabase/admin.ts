import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * secret(service_role)キーを使う管理者クライアント。RLSを無視して全件にアクセスできる。
 * Server Action / Route Handler からのみ呼ぶこと。クライアントコンポーネントに絶対に渡さない。
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
