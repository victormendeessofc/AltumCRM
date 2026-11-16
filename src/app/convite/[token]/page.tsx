import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AcceptInvite } from "@/components/admin/accept-invite";
import { signOut } from "@/lib/auth-actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Convite" };

const UUID = /^[0-9a-f-]{36}$/i;

async function Body({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const next = `/convite/${token}`;

  if (!UUID.test(token)) return <p className="text-fg-2">Este link de convite não é válido.</p>;

  if (!data.user) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-2">Você foi convidado para uma equipe no Altum CRM. Entre ou crie sua conta com o <b className="font-medium text-fg">mesmo e-mail que recebeu o convite</b>.</p>
        <Link href={`/cadastro?next=${next}`} className="inline-flex h-12 items-center justify-center rounded-full bg-accent text-base font-medium text-accent-fg no-underline">Criar conta</Link>
        <Link href={`/entrar?next=${next}`} className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-raised text-base font-medium text-fg no-underline">Já tenho conta</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-2">
        Entrando como <b className="font-medium text-fg">{data.user.email}</b>. O convite só vale para esse e-mail.
      </p>
      <AcceptInvite token={token} />
      <form action={signOut} className="text-center text-[13px] text-fg-2">
        Não é você?{" "}
        <button type="submit" className="cursor-pointer text-accent-text hover:underline">Sair e trocar de conta</button>
      </form>
    </div>
  );
}

export default function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-app px-4 py-10">
      <div className="animate-in-up flex w-full max-w-[420px] flex-col gap-8">
        <div className="flex justify-center">
          <Image src="/brand/altum-logo-horizontal-claro.png" alt="Altum CRM" width={220} height={73} className="logo-dark-only h-auto w-[220px]" priority />
          <Image src="/brand/altum-logo-horizontal-escuro.png" alt="Altum CRM" width={220} height={73} className="logo-light-only h-auto w-[220px]" priority />
        </div>
        <div className="rounded-[var(--radius-2xl)] border border-line-subtle bg-card p-8 shadow-[var(--shadow-card)]">
          <h1 className="mb-3 text-2xl font-medium">Convite para a equipe</h1>
          <Suspense fallback={<div className="h-32" aria-busy="true" />}>
            <Body params={params as Promise<{ token: string }>} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
