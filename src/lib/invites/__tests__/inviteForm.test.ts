import { inviteState, parseInviteForm, type InviteFormInput } from "../inviteForm";

const form: InviteFormInput = {
  name: "Ann Veal",
  person: "",
  email: " Ann@Example.com ",
  phone: "(202) 555-0142",
  role: "VIEWER",
};

describe("parseInviteForm", () => {
  it("reads a complete form", () => {
    expect(parseInviteForm(form)).toEqual({
      ok: true,
      values: {
        name: "Ann Veal",
        personSlug: null,
        email: "ann@example.com",
        phone: "+12025550142",
        role: "VIEWER",
      },
    });
  });

  it("takes a person from the chest in place of a name, and email is optional", () => {
    expect(
      parseInviteForm({ ...form, name: "typed too", person: "maeby", email: "" }),
    ).toMatchObject({
      ok: true,
      values: { name: null, personSlug: "maeby", email: null },
    });
  });

  it("explains each thing that is missing or wrong", () => {
    const result = parseInviteForm({
      name: " ",
      person: "",
      email: "ann@",
      phone: "555",
      role: "OWNER",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(["email", "name", "phone", "role"]);
  });
});

describe("inviteState", () => {
  const now = new Date("2026-11-12T00:00:00Z");
  const later = new Date("2026-12-01T00:00:00Z");
  const earlier = new Date("2026-11-01T00:00:00Z");

  it("tells open, expired, accepted and revoked apart", () => {
    expect(inviteState({ status: "PENDING", expiresAt: later }, now)).toBe("open");
    expect(inviteState({ status: "SENT", expiresAt: later }, now)).toBe("open");
    expect(inviteState({ status: "PENDING", expiresAt: earlier }, now)).toBe("expired");
    // Accepted or revoked wins over the date.
    expect(inviteState({ status: "ACCEPTED", expiresAt: earlier }, now)).toBe("accepted");
    expect(inviteState({ status: "REVOKED", expiresAt: later }, now)).toBe("revoked");
  });
});
