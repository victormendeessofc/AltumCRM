import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { TabBar } from "@/components/shell/tab-bar";
import { requireSession } from "@/lib/session";

/** Lê a sessão (dado dinâmico); por isso fica dentro de um Suspense, exigido pelo Cache Components. */
async function AppShell({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <div className="flex h-dvh gap-4 overflow-hidden bg-app p-2.5 md:p-4">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Topbar userName={session.fullName} orgName={session.org.name} orgs={session.orgs} activeOrgId={session.org.id} />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[var(--radius-xl)] pb-28 md:pb-8 [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-[1600px] px-0.5 pt-1">{children}</div>
        </main>
      </div>
      <TabBar />
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-app" aria-busy="true" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
