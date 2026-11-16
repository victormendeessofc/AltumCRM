"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface ProfileState {
  error?: string;
  ok?: boolean;
  info?: string;
}

export async function updateProfileName(_: ProfileState | undefined, fd: FormData): Promise<ProfileState> {
  const session = await requireSession();
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "O nome precisa ter entre 2 e 80 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", session.userId);
  if (error) return { error: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/", "layout");
  return { ok: true, info: "Nome atualizado." };
}

export async function changePassword(_: ProfileState | undefined, fd: FormData): Promise<ProfileState> {
  await requireSession();
  const pass = String(fd.get("password") ?? "");
  const again = String(fd.get("again") ?? "");
  if (pass.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (pass !== again) return { error: "As senhas não são iguais." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pass });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("same")) return { error: "A nova senha precisa ser diferente da atual." };
    if (m.includes("weak") || m.includes("password")) return { error: "Escolha uma senha mais forte." };
    return { error: "Não foi possível alterar a senha. Entre de novo e tente outra vez." };
  }
  return { ok: true, info: "Senha alterada." };
}
