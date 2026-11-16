"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fieldCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { addStage, createPipeline, deletePipeline, deleteStage, moveStage, renamePipeline, updateStage, type Res } from "@/lib/org-actions";

export interface StageOpt {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
  probability: number;
}
export interface PipelineFull {
  id: string;
  name: string;
  stages: StageOpt[];
}

function useDo() {
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<Res>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (ok) toast.success(ok);
    });
  return { busy, run };
}

function StageRow({ s, first, last }: { s: StageOpt; first: boolean; last: boolean }) {
  const { busy, run } = useDo();
  const [name, setName] = useState(s.name);
  const [prob, setProb] = useState(String(s.probability));
  const dirty = name !== s.name || Number(prob) !== s.probability;
  const closed = s.kind !== "open";

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl px-2 py-1.5 hover:bg-hover">
      <span className="flex w-16 shrink-0 gap-0.5">
        {!closed && (
          <>
            <button type="button" aria-label={`Subir ${s.name}`} disabled={busy || first} onClick={() => run(() => moveStage(s.id, -1))} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-fg disabled:opacity-30">
              <ArrowUp size={14} aria-hidden />
            </button>
            <button type="button" aria-label={`Descer ${s.name}`} disabled={busy || last} onClick={() => run(() => moveStage(s.id, 1))} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-fg disabled:opacity-30">
              <ArrowDown size={14} aria-hidden />
            </button>
          </>
        )}
      </span>
      <input aria-label={`Nome da etapa ${s.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={fieldCls + " !h-9 min-w-[140px] flex-1"} />
      {closed ? (
        <Badge tone={s.kind === "won" ? "success" : "danger"}>{s.kind === "won" ? "Ganho" : "Perdido"}</Badge>
      ) : (
        <label className="flex items-center gap-1.5 text-[12px] text-fg-3">
          Prob.
          <input aria-label={`Probabilidade de ${s.name}`} type="number" min={0} max={100} value={prob} onChange={(e) => setProb(e.target.value)} className={fieldCls + " !h-9 !w-20"} />%
        </label>
      )}
      {dirty && (
        <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => updateStage(s.id, name, Number(prob)), "Etapa salva")}>
          Salvar
        </Button>
      )}
      {!closed && (
        <button type="button" aria-label={`Excluir etapa ${s.name}`} title="Excluir etapa" disabled={busy} onClick={() => run(() => deleteStage(s.id), "Etapa excluída")} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-fg-3 transition-[background-color,color] duration-[120ms] ease-out hover:bg-danger-soft hover:text-danger">
          <Trash2 size={15} aria-hidden />
        </button>
      )}
    </li>
  );
}

function PipelineCard({ p, canDelete }: { p: PipelineFull; canDelete: boolean }) {
  const { busy, run } = useDo();
  const [name, setName] = useState(p.name);
  const [newStage, setNewStage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const open = p.stages.filter((s) => s.kind === "open");

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Nome do funil" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={fieldCls + " !h-10 min-w-[200px] flex-1 !text-base !font-medium"} />
        {name.trim() !== p.name && (
          <Button variant="primary" disabled={busy} onClick={() => run(() => renamePipeline(p.id, name), "Funil renomeado")}>
            Salvar nome
          </Button>
        )}
        {canDelete &&
          (confirm ? (
            <span className="flex items-center gap-2 text-[13px] text-fg-2">
              Excluir funil?
              <Button size="sm" variant="danger" disabled={busy} onClick={() => run(() => deletePipeline(p.id), "Funil excluído")}>
                Sim
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Não
              </Button>
            </span>
          ) : (
            <Button variant="ghost" iconLeft={Trash2} onClick={() => setConfirm(true)}>
              Excluir funil
            </Button>
          ))}
      </div>
      <ul className="flex flex-col">
        {p.stages.map((s) => (
          <StageRow key={s.id + s.name + s.probability} s={s} first={open[0]?.id === s.id} last={open[open.length - 1]?.id === s.id} />
        ))}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newStage.trim()) return;
          run(() => addStage(p.id, newStage, 50), "Etapa adicionada");
          setNewStage("");
        }}
      >
        <input aria-label="Nova etapa" value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="Nome da nova etapa" maxLength={60} className={fieldCls + " !h-10 min-w-[180px] flex-1"} />
        <Button type="submit" iconLeft={Plus} disabled={busy || !newStage.trim()}>
          Adicionar etapa
        </Button>
      </form>
      <p className="text-[12px] text-fg-3">A probabilidade de cada etapa pondera o valor dos negócios na Central. Ganho e Perdido são fixos; só etapas sem negócios podem ser excluídas.</p>
    </Card>
  );
}

export function PipelinesEditor({ pipelines }: { pipelines: PipelineFull[] }) {
  const { busy, run } = useDo();
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-4">
      {pipelines.map((p) => (
        <PipelineCard key={p.id} p={p} canDelete={pipelines.length > 1} />
      ))}
      <Card>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(() => createPipeline(name), "Funil criado");
            setName("");
          }}
        >
          <input aria-label="Nome do novo funil" value={name} onChange={(e) => setName(e.target.value)} placeholder="Novo funil (ex.: Renovações)" maxLength={80} className={fieldCls + " !h-10 min-w-[200px] flex-1"} />
          <Button type="submit" variant="primary" iconLeft={Plus} disabled={busy || !name.trim()}>
            Criar funil
          </Button>
        </form>
      </Card>
    </div>
  );
}
