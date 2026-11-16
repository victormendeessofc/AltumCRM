import type { Metadata } from "next";
import { ProfileForms } from "@/components/profile/profile-forms";
import { roleLabel } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
  const session = await requireSession();
  return (
    <div className="animate-in-up flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-medium leading-tight">Meu perfil</h1>
        <p className="text-[13px] text-fg-2">
          {session.org.name} · {roleLabel(session.org.role)}
        </p>
      </div>
      <ProfileForms name={session.fullName} email={session.email} />
    </div>
  );
}
