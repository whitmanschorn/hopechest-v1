/** Checks what an admin typed into the invite form. Pure: no database. */
import { normalizePhone } from "@/lib/auth/phone";

export const INVITE_ROLES = ["VIEWER", "CONTRIBUTOR", "ADMIN"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const ROLE_LABELS: Record<InviteRole, string> = {
  VIEWER: "Look only",
  CONTRIBUTOR: "Add and edit",
  ADMIN: "Everything, including inviting people",
};

export interface InviteFormInput {
  /** Their name, when they are not in the chest yet. */
  name: string;
  /** Slug of the person they already are in the chest, instead of a name. */
  person: string;
  email: string;
  phone: string;
  role: string;
}

export interface InviteValues {
  name: string | null;
  personSlug: string | null;
  email: string | null;
  /** E.164. */
  phone: string;
  role: InviteRole;
}

export type InviteErrors = Partial<Record<keyof InviteFormInput, string>>;

/** Invite links work for this long, and can be renewed. */
export const INVITE_DAYS = 30;

export function parseInviteForm(
  input: InviteFormInput,
): { ok: true; values: InviteValues } | { ok: false; errors: InviteErrors } {
  const errors: InviteErrors = {};
  const name = input.name.trim();
  const personSlug = input.person.trim();
  if (!name && !personSlug) errors.name = "Give their name, or pick them from the chest.";
  if (name.length > 120) errors.name = "That name is too long.";

  const email = input.email.trim().toLowerCase();
  // Deliberately loose: this is a note of where to reach them, not a login.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "That email address looks incomplete.";

  const phone = normalizePhone(input.phone);
  if (!phone)
    errors.phone = "Enter their mobile number, with area code. Their sign-in code is texted to it.";

  const role = INVITE_ROLES.find((value) => value === input.role);
  if (!role) errors.role = "Choose what they can do.";

  if (Object.keys(errors).length > 0 || !phone || !role) return { ok: false, errors };
  return {
    ok: true,
    // A person picked from the chest wins over a typed name.
    values: {
      name: personSlug ? null : name,
      personSlug: personSlug || null,
      email: email || null,
      phone,
      role,
    },
  };
}

export type InviteState = "open" | "expired" | "accepted" | "revoked";

/** Where an invite stands, for the join page and the members list. */
export function inviteState(
  invite: { status: "PENDING" | "SENT" | "ACCEPTED" | "REVOKED"; expiresAt: Date },
  now: Date = new Date(),
): InviteState {
  if (invite.status === "ACCEPTED") return "accepted";
  if (invite.status === "REVOKED") return "revoked";
  return invite.expiresAt <= now ? "expired" : "open";
}
