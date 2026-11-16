import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Altum CRM">
          <Image src="/brand/altum-logo-horizontal-claro.png" alt="Altum CRM" width={160} height={53} className="logo-dark-only h-auto w-[160px]" />
          <Image src="/brand/altum-logo-horizontal-escuro.png" alt="Altum CRM" width={160} height={53} className="logo-light-only h-auto w-[160px]" />
        </Link>
        <nav className="flex gap-4 text-[13px]">
          <Link href="/termos">Termos de uso</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </header>
      <article className="flex flex-col gap-4 text-[15px] leading-relaxed text-fg-2 [&_a]:underline [&_h1]:text-[28px] [&_h1]:font-medium [&_h1]:leading-tight [&_h1]:text-fg [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-fg">
        {children}
      </article>
    </main>
  );
}
