"use server";
import { redirect } from "next/navigation";
import { getOrigin } from "@/lib/origin";
import { safeNext } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  ok?: boolean;
  error?: string;
  info?: string;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function signIn(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (!validEmail(email)) return { error: "Informe um e-mail válido." };
  if (!password) return { error: "Informe sua senha." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message.toLowerCase().includes("email not confirmed") ? "Confirme seu e-mail antes de entrar. Enviamos um link para a sua caixa de entrada." : "E-mail ou senha incorretos." };
  }
  redirect(safeNext(fd.get("next")) ?? "/painel");
}

export async function signUp(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const name = str(fd, "name");
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (name.length < 2) return { error: "Informe seu nome." };
  if (!validEmail(email)) return { error: "Informe um e-mail válido." };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  const supabase = await createClient();
  // Quem vem de um convite precisa voltar ao convite depois de confirmar o e-mail (senão cai numa conta zerada).
  const invite = safeNext(fd.get("next"));
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${await getOrigin()}/auth/callback?next=${encodeURIComponent(invite ?? "/painel")}` } });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("rate limit")) return { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo." };
  }
  if (error) return { error: error.message.toLowerCase().includes("already") ? "Este e-mail já tem cadastro. Tente entrar." : "Não foi possível criar a conta agora. Tente de novo." };
  if (!data.session) return { info: "Conta criada. Confirme seu e-mail pelo link que enviamos e depois entre." };
  redirect(safeNext(fd.get("next")) ?? "/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function createOrganization(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const name = str(fd, "name");
  if (name.length < 2 || name.length > 80) return { error: "O nome da organização precisa ter entre 2 e 80 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) return { error: "Não foi possível criar a organização. Tente de novo." };
  redirect("/painel");
}

/** Pede o e-mail de recuperação. A resposta é sempre a mesma, exista ou não a conta (não revela quem tem cadastro). */
export async function requestPasswordReset(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  if (!validEmail(email)) return { error: "Informe um e-mail válido." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await getOrigin()}/auth/callback?next=/redefinir-senha` });
  return { info: "Se esse e-mail tiver cadastro, enviamos um link para redefinir a senha. Confira também o spam." };
}

/** Define a nova senha de quem chegou pelo link do e-mail (ou de quem já está logado). */
export async function resetPassword(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const pass = String(fd.get("password") ?? "");
  const again = String(fd.get("again") ?? "");
  if (pass.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (pass !== again) return { error: "As senhas não são iguais." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "O link expirou. Peça um novo em \"Esqueci minha senha\"." };
  const { error } = await supabase.auth.updateUser({ password: pass });
  if (error) {
    const m = error.message.toLowerCase();
    return { error: m.includes("same") ? "A nova senha precisa ser diferente da atual." : "Escolha uma senha mais forte e tente de novo." };
  }
  redirect("/painel");
}
