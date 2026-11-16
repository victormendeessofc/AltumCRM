import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, safeCell, toCsv } from "./csv";
import { IMPORT_MAX_ROWS, parseContactsCsv, validateContact } from "./contacts";

describe("csv", () => {
  it("lê campos com aspas, separador e quebra de linha dentro", () => {
    const rows = parseCsv('nome,obs\n"Silva, João","linha1\nlinha2"\n"Ana ""A""",ok');
    expect(rows).toEqual([["nome", "obs"], ["Silva, João", "linha1\nlinha2"], ['Ana "A"', "ok"]]);
  });
  it("detecta ponto e vírgula (Excel pt-BR) e BOM", () => {
    expect(detectDelimiter("﻿Nome;Email;Telefone")).toBe(";");
    expect(parseCsv("﻿Nome;Email\nAna;a@x.com")).toEqual([["Nome", "Email"], ["Ana", "a@x.com"]]);
  });
  it("aceita CRLF e ignora linhas vazias", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });
  it("protege contra injeção de fórmula na exportação", () => {
    expect(safeCell("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(safeCell("+55 11 99999")).toBe("'+55 11 99999");
    expect(safeCell("Ana")).toBe("Ana");
    const out = toCsv([["Nome"], ["=1+1"]]);
    expect(out).toContain("'=1+1");
  });
  it("faz round-trip com acentos, aspas e separadores", () => {
    const data = [["Nome", "Obs"], ['João "Zé" Silva', "a;b\nc"]];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });
});

describe("validateContact", () => {
  it("exige nome", () => {
    expect(validateContact({ name: "  " })).toEqual({ ok: false, error: "Informe o nome do contato." });
  });
  it("normaliza e-mail para minúsculas e vazio para null", () => {
    const r = validateContact({ name: " Ana ", email: " ANA@X.COM ", phone: "" });
    expect(r.ok && r.value).toMatchObject({ name: "Ana", email: "ana@x.com", phone: null });
  });
  it("recusa e-mail inválido", () => {
    expect(validateContact({ name: "Ana", email: "ana@" }).ok).toBe(false);
  });
  it("trunca campos longos em vez de falhar", () => {
    const r = validateContact({ name: "x".repeat(500) });
    expect(r.ok && r.value.name.length).toBe(120);
  });
});

describe("parseContactsCsv", () => {
  it("reconhece cabeçalhos em português e inglês", () => {
    const r = parseContactsCsv("Nome;E-mail;Celular;Empresa;Cargo\nAna;ana@x.com;11999;Alicerce;CEO");
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ name: "Ana", email: "ana@x.com", phone: "11999", company: "Alicerce", jobTitle: "CEO" });
  });
  it("lista colunas ignoradas", () => {
    expect(parseContactsCsv("Nome,CPF\nAna,123").ignoredColumns).toEqual(["CPF"]);
  });
  it("aponta a linha de cada erro e segue com as válidas", () => {
    const r = parseContactsCsv("Nome,Email\nAna,ana@x.com\n,sem@nome.com\nBia,bia@");
    expect(r.valid).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
  it("detecta e-mail repetido dentro do arquivo", () => {
    const r = parseContactsCsv("Nome,Email\nAna,a@x.com\nAna 2,A@x.com");
    expect(r.valid).toHaveLength(1);
    expect(r.errors[0].error).toContain("repetido");
  });
  it("exige coluna Nome", () => {
    const r = parseContactsCsv("Email\na@x.com");
    expect(r.valid).toHaveLength(0);
    expect(r.errors[0].error).toContain("Nome");
  });
  it("recusa arquivo grande demais", () => {
    const big = "Nome\n" + Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => "P" + i).join("\n");
    expect(parseContactsCsv(big).tooLarge).toBe(true);
  });
  it("arquivo vazio dá erro claro", () => {
    expect(parseContactsCsv("").errors[0].error).toContain("vazio");
  });
});
