import { describe, expect, it } from "vitest";
import { comCabecalhosSeguranca } from "./server";

describe("cabeçalhos de segurança", () => {
  it("bloqueia iframe de outro site e mantém status/corpo/cabeçalhos originais", async () => {
    const r = comCabecalhosSeguranca(new Response("ola", { status: 201, headers: { "content-type": "text/html" } }));
    expect(r.status).toBe(201);
    expect(await r.text()).toBe("ola");
    expect(r.headers.get("content-type")).toBe("text/html");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
