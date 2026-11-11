import { assertCan, can, type Actor } from "../actor";

const user = (role: "ADMIN" | "CONTRIBUTOR" | "VIEWER"): Actor => ({
  kind: "user",
  userId: "u",
  role,
  personId: null,
});
const key = (...scopes: string[]): Actor => ({ kind: "apiKey", apiKeyId: "k", scopes });

describe("can", () => {
  it("lets viewers read and nothing else", () => {
    expect(can(user("VIEWER"), "read")).toBe(true);
    expect(can(user("VIEWER"), "write")).toBe(false);
    expect(can(user("VIEWER"), "admin")).toBe(false);
  });

  it("lets contributors add and ingest but not administer", () => {
    expect(can(user("CONTRIBUTOR"), "write")).toBe(true);
    expect(can(user("CONTRIBUTOR"), "ingest")).toBe(true);
    expect(can(user("CONTRIBUTOR"), "admin")).toBe(false);
  });

  it("lets admins do everything", () => {
    for (const permission of ["read", "write", "ingest", "admin"] as const) {
      expect(can(user("ADMIN"), permission)).toBe(true);
    }
  });

  it("limits API keys to their scopes, with admin covering all", () => {
    expect(can(key("read"), "read")).toBe(true);
    expect(can(key("read"), "write")).toBe(false);
    expect(can(key("ingest"), "ingest")).toBe(true);
    expect(can(key("admin"), "write")).toBe(true);
  });

  it("throws from assertCan when not allowed", () => {
    expect(() => assertCan(user("VIEWER"), "write")).toThrow(/write/);
    expect(() => assertCan(user("ADMIN"), "admin")).not.toThrow();
  });
});
