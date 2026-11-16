import type { Metadata } from "next";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administração" };

export default function Page() {
  return (
    <div className="animate-in-up flex flex-col gap-4">
      <h1 className="text-[28px] font-medium leading-tight">Administração</h1>
      <Card>
        <p className="text-fg-2">Esta tela é construída na Fase 1, depois da autenticação e do banco.</p>
      </Card>
    </div>
  );
}
