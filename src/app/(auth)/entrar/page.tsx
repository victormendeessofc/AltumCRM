import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/lib/auth-actions";
import { safeNext } from "@/lib/roles";

export const metadata: Metadata = { title: "Entrar" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <>
      {sp.erro === "link" && (
        <p role="alert" className="mb-4 rounded-2xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          O link expirou ou já foi usado. Entre com sua senha ou peça um novo link.
        </p>
      )}
    <AuthForm
      action={signIn}
      submit="Entrar"
      hidden={next ? { next } : undefined}
      fields={[
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
      ]}
      footer={
        <>
          <Link href="/esqueci-senha">Esqueci minha senha</Link>
          <br />
          Ainda não tem conta? <Link href={next ? `/cadastro?next=${next}` : "/cadastro"}>Criar conta</Link>
        </>
      }
    />
    </>
  );
}

export default function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium">Entrar</h1>
      <p className="mb-6 text-[13px] text-fg-2">Acesse o CRM da sua equipe.</p>
      <Suspense fallback={<div className="h-56" aria-busy="true" />}>
        <Form searchParams={searchParams as Promise<{ next?: string; erro?: string }>} />
      </Suspense>
    </>
  );
}
