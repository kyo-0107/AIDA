import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server Component / Server Action から使う、ログイン中ユーザー権限のクライアント。
 * RLS が effective に効く(publishable/anon キー + Cookie のセッション)。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component から呼ばれた場合は書き込めない。
            // middleware がセッション更新を担当するので無視してよい。
          }
        },
      },
    }
  );
}
