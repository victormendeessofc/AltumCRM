import type { Metadata } from "next";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Central" };

export default function PainelPage() {
  return (
    <div className="animate-in-up flex flex-col gap-4">
      <h1 className="text-[28px] font-medium leading-tight">Central</h1>
      <Card>
        <p className="text-fg-2">
          A fundação está pronta. Os KPIs reais da Central chegam depois que funis, contatos e tarefas
          existirem no banco.
        </p>
      </Card>
    </div>
  );
}
