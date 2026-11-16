import type { InputHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const heights = { md: "h-10", lg: "h-12" } as const;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: keyof typeof heights;
  iconLeft?: LucideIcon;
}

export function Input({ size = "md", iconLeft: Icon, className, ...rest }: InputProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-full border border-line bg-raised px-4 text-fg",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out focus-within:border-accent focus-within:shadow-[var(--focus-ring)]",
        heights[size],
        className,
      )}
    >
      {Icon && <Icon size={size === "lg" ? 18 : 16} className="shrink-0 text-fg-3" aria-hidden />}
      <input
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3 focus-visible:shadow-none"
        {...rest}
      />
    </div>
  );
}
