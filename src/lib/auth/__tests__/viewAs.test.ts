import { demoDoorOpen, effectiveIdentity } from "../viewAs";

const demo = { role: "VIEWER" as const, personId: null };

describe("demoDoorOpen", () => {
  it("needs a real password and a site that is not a family's", () => {
    expect(demoDoorOpen("staging", "a-long-enough-password")).toBe(true);
    expect(demoDoorOpen("development", "a-long-enough-password")).toBe(true);
    expect(demoDoorOpen("production", "a-long-enough-password")).toBe(false);
    expect(demoDoorOpen("staging", undefined)).toBe(false);
    expect(demoDoorOpen("staging", "")).toBe(false);
    expect(demoDoorOpen("staging", "short")).toBe(false);
    expect(demoDoorOpen("staging", "            ")).toBe(false);
  });
});

describe("effectiveIdentity", () => {
  it("is the account itself for an ordinary session", () => {
    const michael = { role: "ADMIN" as const, personId: "michael" };
    expect(
      effectiveIdentity(michael, { actingPersonId: null, actingRole: null }, "staging"),
    ).toEqual({
      role: "ADMIN",
      personId: "michael",
      viewingAs: false,
    });
  });

  it("is the chosen person, with the chosen access, for a demo session", () => {
    expect(
      effectiveIdentity(demo, { actingPersonId: "maeby", actingRole: "CONTRIBUTOR" }, "staging"),
    ).toEqual({ role: "CONTRIBUTOR", personId: "maeby", viewingAs: true });
    expect(
      effectiveIdentity(demo, { actingPersonId: "maeby", actingRole: "VIEWER" }, "staging").role,
    ).toBe("VIEWER");
  });

  it("never grants admin, whatever the session row says", () => {
    expect(
      effectiveIdentity(demo, { actingPersonId: "maeby", actingRole: "ADMIN" }, "staging").role,
    ).toBe("VIEWER");
    expect(
      effectiveIdentity(demo, { actingPersonId: "maeby", actingRole: null }, "staging").role,
    ).toBe("VIEWER");
  });

  it("ignores the acting fields in production", () => {
    expect(
      effectiveIdentity(demo, { actingPersonId: "maeby", actingRole: "CONTRIBUTOR" }, "production"),
    ).toEqual({ role: "VIEWER", personId: null, viewingAs: false });
  });
});
