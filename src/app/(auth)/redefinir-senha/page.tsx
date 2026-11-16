import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { resetPassword } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Nova senha" };

export default function RedefinirSenhaPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium">Crie uma nova senha</h1>
      <p className="mb-6 text-[13px] text-fg-2">Escolha uma senha com pelo menos 8 caracteres.</p>
      <AuthForm
        action={resetPassword}
        submit="Salvar nova senha"
        fields={[
          { name: "password", label: "Nova senha", type: "password", autoComplete: "new-password" },
          { name: "again", label: "Repita a nova senha", type: "password", autoComplete: "new-password" },
        ]}
      />
    </>
  );
}
