import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordReset } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium">Esqueci minha senha</h1>
      <p className="mb-6 text-[13px] text-fg-2">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
      <AuthForm
        action={requestPasswordReset}
        submit="Enviar link"
        fields={[{ name: "email", label: "E-mail", type: "email", autoComplete: "email" }]}
        footer={<Link href="/entrar">Voltar para entrar</Link>}
      />
    </>
  );
}
