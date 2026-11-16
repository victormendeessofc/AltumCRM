import { cn } from "@/lib/cn";

const PALETTE = ["#6893cf", "#c5d88b", "#44ef9a", "#f2c14e", "#f2766b", "#9db9e0", "#b2c86c"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export interface AvatarProps {
  name: string;
  size?: number;
  shape?: "circle" | "square";
  status?: "online" | "away" | "offline";
  className?: string;
}

export function Avatar({ name, size = 36, shape = "circle", status, className }: AvatarProps) {
  const bg = PALETTE[hash(name) % PALETTE.length];
  const statusColor = { online: "var(--success)", away: "var(--warning)", offline: "var(--text-tertiary)" } as const;
  return (
    <span
      role="img"
      aria-label={name}
      className={cn("relative inline-flex shrink-0 items-center justify-center font-medium", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        borderRadius: shape === "circle" ? 999 : Math.round(size * 0.32),
        background: `color-mix(in srgb, ${bg} 22%, var(--surface-raised))`,
        color: bg,
        border: "1px solid var(--border-default)",
      }}
    >
      {initials(name)}
      {status && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[var(--surface-card)]"
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28), background: statusColor[status] }}
        />
      )}
    </span>
  );
}
