import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-app px-4 py-10">
      <div className="animate-in-up flex w-full max-w-[420px] flex-col gap-8">
        <div className="flex justify-center">
          <Image src="/brand/altum-logo-horizontal-claro.png" alt="Altum CRM" width={220} height={73} className="logo-dark-only h-auto w-[220px]" priority />
          <Image src="/brand/altum-logo-horizontal-escuro.png" alt="Altum CRM" width={220} height={73} className="logo-light-only h-auto w-[220px]" priority />
        </div>
        <div className="rounded-[var(--radius-2xl)] border border-line-subtle bg-card p-8 shadow-[var(--shadow-card)]">{children}</div>
        <p className="text-center text-[12px] text-fg-3">
          Ao continuar você concorda com os <Link href="/termos">Termos de uso</Link> e a <Link href="/privacidade">Política de privacidade</Link>.
        </p>
      </div>
    </main>
  );
}
