import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium">Criar conta</h1>
      <p className="mb-6 text-[13px] text-fg-2">Em seguida você cria a organização da sua empresa.</p>
      <AuthForm
        action={signUp}
        submit="Criar conta"
        fields={[
          { name: "name", label: "Seu nome", autoComplete: "name" },
          { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
          { name: "password", label: "Senha (mínimo 8 caracteres)", type: "password", autoComplete: "new-password" },
        ]}
        footer={
          <>
            Já tem conta? <Link href="/entrar">Entrar</Link>
          </>
        }
      />
    </>
  );
}
