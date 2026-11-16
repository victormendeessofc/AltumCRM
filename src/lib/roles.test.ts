import { describe, expect, it } from "vitest";
import { isOrgRole, roleLabel, safeNext } from "./roles";

describe("roles", () => {
  it("traduz o papel", () => {
    expect(roleLabel("admin")).toBe("Administrador");
    expect(roleLabel("seller")).toBe("Vendedor");
  });
  it("valida papéis", () => {
    expect(isOrgRole("manager")).toBe(true);
    expect(isOrgRole("root")).toBe(false);
    expect(isOrgRole(undefined)).toBe(false);
  });
  it("safeNext só aceita /convite/<uuid>", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(safeNext(`/convite/${id}`)).toBe(`/convite/${id}`);
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/admin")).toBeNull();
    expect(safeNext(`/convite/${id}/../x`)).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
