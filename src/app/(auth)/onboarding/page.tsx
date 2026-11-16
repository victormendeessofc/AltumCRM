import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { createOrganization, signOut } from "@/lib/auth-actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sua organização" };

async function OnboardingForm() {
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar");
  const { count } = await supabase.from("memberships").select("org_id", { count: "exact", head: true });
  if (count && count > 0) redirect("/painel");

  return (
    <AuthForm
      action={createOrganization}
      submit="Criar organização"
      fields={[{ name: "name", label: "Nome da empresa", placeholder: "Ex.: Vértice Soluções" }]}
      footer={
        <form action={signOut} className="inline">
          <button type="submit" className="cursor-pointer text-accent-text underline-offset-2 hover:underline">
            Sair
          </button>
        </form>
      }
    />
  );
}

export default function OnboardingPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium">Crie sua organização</h1>
      <p className="mb-6 text-[13px] text-fg-2">
        É o espaço da sua empresa: funis, contatos e time ficam aqui. Você será o administrador.
      </p>
      <Suspense fallback={<div className="h-40" aria-busy="true" />}>
        <OnboardingForm />
      </Suspense>
    </>
  );
}
