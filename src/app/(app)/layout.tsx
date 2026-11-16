import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { TabBar } from "@/components/shell/tab-bar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh gap-4 overflow-hidden bg-app p-2.5 md:p-4">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[var(--radius-xl)] pb-28 md:pb-8 [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-[1600px] px-0.5 pt-1">{children}</div>
        </main>
      </div>
      <TabBar />
    </div>
  );
}
