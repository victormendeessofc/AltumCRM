import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]",
  secondary: "bg-raised text-fg border border-line hover:border-line-strong",
  ghost: "bg-transparent text-fg-2 hover:bg-hover hover:text-fg",
  danger: "bg-danger-soft text-danger border border-transparent hover:border-danger",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  children?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  iconLeft: Left,
  iconRight: Right,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const iconSize = size === "lg" ? 18 : 16;
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full font-medium",
        "transition-[transform,background-color,border-color,color] duration-[160ms] ease-out",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Left && <Left size={iconSize} aria-hidden />}
      {children}
      {Right && <Right size={iconSize} aria-hidden />}
    </button>
  );
}
