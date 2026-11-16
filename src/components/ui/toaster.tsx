"use client";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      theme="system"
      toastOptions={{
        style: {
          background: "var(--surface-overlay)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
          borderRadius: "18px",
          fontFamily: "var(--font-urbanist), system-ui, sans-serif",
        },
      }}
    />
  );
}

export { toast } from "sonner";
