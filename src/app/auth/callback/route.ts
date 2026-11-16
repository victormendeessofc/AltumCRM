import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Só estes destinos são aceitos depois de validar o link do e-mail (evita redirecionamento aberto). */
const ALLOWED = ["/painel", "/redefinir-senha"];

/** Destino dos links enviados por e-mail (confirmação de cadastro e recuperação de senha). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/painel";
  const dest = ALLOWED.includes(next) ? next : "/painel";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${dest}`);
  }
  return NextResponse.redirect(`${origin}/entrar?erro=link`);
}
