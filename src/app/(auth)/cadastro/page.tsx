import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/lib/auth-actions";
import { safeNext } from "@/lib/roles";

export const metadata: Metadata = { title: "Criar conta" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  return (
    <AuthForm
      action={signUp}
      submit="Criar conta"
      hidden={next ? { next } : undefined}
      fields={[
        { name: "name", label: "Seu nome", autoComplete: "name" },
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Senha (mínimo 8 caracteres)", type: "password", autoComplete: "new-password" },
      ]}
      footer={
        <>
          Já tem conta? <Link href={next ? `/entrar?next=${next}` : "/entrar"}>Entrar</Link>
        </>
      }
    />
  );
}

export default function CadastroPage({ searchParams }: PageProps<"/cadastro">) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium">Criar conta</h1>
      <p className="mb-6 text-[13px] text-fg-2">
        Em seguida você cria a organização da sua empresa, ou entra na que te convidou.
      </p>
      <Suspense fallback={<div className="h-72" aria-busy="true" />}>
        <Form searchParams={searchParams as Promise<{ next?: string }>} />
      </Suspense>
    </>
  );
}
