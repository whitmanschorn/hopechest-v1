import { canViewAs, effectiveIdentity } from "../viewAs";

const admin = { role: "ADMIN" as const, personId: "michael" };
const asMaeby = { actingPersonId: "maeby", actingRole: "VIEWER" as const };

describe("effectiveIdentity", () => {
  it("is the real person when no one is being viewed as", () => {
    expect(effectiveIdentity(admin, { actingPersonId: null, actingRole: null }, "staging")).toEqual(
      {
        role: "ADMIN",
        personId: "michael",
        viewingAs: false,
      },
    );
  });

  it("takes the chosen person and access level on staging", () => {
    expect(effectiveIdentity(admin, asMaeby, "staging")).toEqual({
      role: "VIEWER",
      personId: "maeby",
      viewingAs: true,
    });
  });

  it("keeps the admin's own access when no level was chosen", () => {
    expect(
      effectiveIdentity(admin, { actingPersonId: "maeby", actingRole: null }, "development"),
    ).toEqual({
      role: "ADMIN",
      personId: "maeby",
      viewingAs: true,
    });
  });

  it("ignores a stored choice in production", () => {
    expect(effectiveIdentity(admin, asMaeby, "production")).toEqual({
      role: "ADMIN",
      personId: "michael",
      viewingAs: false,
    });
  });

  it("ignores a stored choice for anyone who is not an admin", () => {
    // Even one that asks for more access than they have.
    const contributor = { role: "CONTRIBUTOR" as const, personId: "george-michael" };
    expect(
      effectiveIdentity(contributor, { actingPersonId: "michael", actingRole: "ADMIN" }, "staging"),
    ).toEqual({
      role: "CONTRIBUTOR",
      personId: "george-michael",
      viewingAs: false,
    });
  });
});

describe("canViewAs", () => {
  it("is for admins, outside production", () => {
    expect(canViewAs({ role: "ADMIN" }, "staging")).toBe(true);
    expect(canViewAs({ role: "ADMIN" }, "development")).toBe(true);
    expect(canViewAs({ role: "ADMIN" }, "production")).toBe(false);
    expect(canViewAs({ role: "VIEWER" }, "staging")).toBe(false);
  });
});
