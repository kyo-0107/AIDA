import { getCurrentUserOrRedirect } from "@/lib/current-user";
import Sidebar from "@/app/components/sidebar";
import TopBar from "@/app/components/top-bar";
import TabNav from "@/app/components/tab-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, displayName } = await getCurrentUserOrRedirect();

  type ProjectRow = { id: number; name: string };
  type MembershipRow = { projects: ProjectRow | null };
  const { data: rows } = await supabase
    .from("project_members")
    .select("projects(id, name)")
    .eq("user_id", user.id) // 自分の参加分だけ(RLSは同じプロジェクトの他メンバーの行も見えてしまうため)
    .returns<MembershipRow[]>();
  const projects = (rows ?? [])
    .map((r) => r.projects)
    .filter((p): p is ProjectRow => Boolean(p));

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar projects={projects} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar displayName={displayName} />
        <TabNav />
        <main className="min-w-0 flex-1 px-6 py-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
