import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium">Entrar</h1>
      <p className="mb-6 text-[13px] text-fg-2">Acesse o CRM da sua equipe.</p>
      <AuthForm
        action={signIn}
        submit="Entrar"
        fields={[
          { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
          { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
        ]}
        footer={
          <>
            Ainda não tem conta? <Link href="/cadastro">Criar conta</Link>
          </>
        }
      />
    </>
  );
}
