import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Avatar, initials } from "./avatar";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Progress } from "./progress";
import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("mescla classes do Tailwind com o último vencendo", () => {
    expect(cn("px-2", "px-4", false && "hidden")).toBe("px-4");
  });
});

describe("initials", () => {
  it("usa primeira e última palavra", () => {
    expect(initials("Marina Duarte")).toBe("MD");
    expect(initials("Ana Maria da Silva")).toBe("AS");
  });
  it("lida com nome simples e vazio", () => {
    expect(initials("Caio")).toBe("C");
    expect(initials("   ")).toBe("?");
  });
});

describe("Button", () => {
  it("dispara onClick e não envia formulário por padrão", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    const btn = screen.getByRole("button", { name: "Salvar" });
    expect(btn).toHaveAttribute("type", "button");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("não dispara quando desabilitado", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Salvar</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("expõe o nome acessível", () => {
    render(<IconButton icon={Bell} label="Notificações" />);
    expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("é acessível pelo nome", () => {
    render(<Avatar name="Marina Duarte" />);
    expect(screen.getByRole("img", { name: "Marina Duarte" })).toHaveTextContent("MD");
  });
});

describe("Progress", () => {
  it("limita o valor entre 0 e 100%", () => {
    render(<Progress value={150} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.firstElementChild).toHaveStyle({ width: "100%" });
  });
  it("não quebra com max 0", () => {
    render(<Progress value={5} max={0} />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "0%" });
  });
});
