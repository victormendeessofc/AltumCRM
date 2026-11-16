"use client";
import { useState } from "react";
import { Bell, Plus, Search, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";

/** Página interna para conferir os componentes base. Sai do ar antes da produção. */
export default function DesignPage() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("kanban");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[28px] font-medium leading-tight">Componentes base</h1>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Botões</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" iconLeft={Plus}>Novo negócio</Button>
          <Button>Secundário</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" iconLeft={Trash2}>Excluir</Button>
          <Button variant="primary" size="sm">Pequeno</Button>
          <Button variant="primary" size="lg">Grande</Button>
          <Button disabled>Desabilitado</Button>
          <IconButton icon={Bell} label="Notificações" badge />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Campos, abas e selos</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Input iconLeft={Search} placeholder="Buscar…" className="w-72" />
          <Tabs
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "kanban", label: "Kanban" },
              { value: "lista", label: "Lista" },
            ]}
          />
          <Badge>Neutro</Badge>
          <Badge tone="accent">Destaque</Badge>
          <Badge tone="success">Ganho</Badge>
          <Badge tone="warning">Parado</Badge>
          <Badge tone="danger">Perdido</Badge>
          <Badge tone="info">Info</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Avatar name="Marina Duarte" status="online" />
          <Avatar name="Rafael Lima" shape="square" />
          <Avatar name="Caio" size={28} />
          <div className="w-64">
            <Progress value={73} />
          </div>
          <span className="num text-fg-2">73% da meta</span>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpen(true)}>Abrir modal</Button>
        <Button onClick={() => toast.success("Negócio movido para Proposta")}>Mostrar toast</Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen} title="Novo contato" description="Exemplo de modal com foco preso e Esc para fechar.">
        <div className="flex flex-col gap-3">
          <Input placeholder="Nome" />
          <Input placeholder="E-mail" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Salvar</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
