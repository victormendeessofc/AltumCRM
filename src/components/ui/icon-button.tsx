import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const dims = { sm: "size-8", md: "size-10", lg: "size-12" } as const;

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Obrigatório: nome acessível do botão */
  label: string;
  size?: keyof typeof dims;
  badge?: boolean;
}

export function IconButton({ icon: Icon, label, size = "md", badge, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-raised text-fg-2",
        "transition-[transform,border-color,color] duration-[160ms] ease-out hover:border-line-strong hover:text-fg active:scale-[0.97]",
        dims[size],
        className,
      )}
      {...rest}
    >
      <Icon size={size === "lg" ? 20 : 18} aria-hidden />
      {badge && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent ring-2 ring-[var(--surface-raised)]" />}
    </button>
  );
}
