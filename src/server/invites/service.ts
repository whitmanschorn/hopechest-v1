import { formatPhone, maskPhone } from "@/lib/auth/phone";
import { hashToken, randomToken } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db";
import {
  INVITE_DAYS,
  inviteState,
  parseInviteForm,
  type InviteErrors,
  type InviteFormInput,
  type InviteState,
} from "@/lib/invites/inviteForm";
import { assertCan, type Actor } from "@/server/actor";
import { createPerson } from "@/server/people/service";

const DAY = 24 * 60 * 60 * 1000;
const expiry = () => new Date(Date.now() + INVITE_DAYS * DAY);

export interface MemberRow {
  id: string;
  name: string;
  personSlug: string | null;
  phone: string;
  email: string | null;
  role: string;
  lastSeenAt: Date | null;
}

export interface InviteRow {
  id: string;
  name: string;
  personSlug: string;
  phone: string;
  email: string | null;
  role: string;
  state: InviteState;
  expiresAt: Date;
  /** The path of the link to send: "/join/<token>". Null for an invite that has none to show. */
  path: string | null;
}

/** Everyone with an account, and everyone invited who has not joined yet. Admins only. */
export async function listMembers(
  actor: Actor,
): Promise<{ members: MemberRow[]; invites: InviteRow[] }> {
  assertCan(actor, "admin");
  const db = getDb();
  const [users, invites] = await Promise.all([
    db.user.findMany({
      // The shared demo account is not a person anyone invited.
      where: { disabledAt: null, phone: { startsWith: "+" } },
      include: { person: { select: { slug: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invite.findMany({
      where: { status: { in: ["PENDING", "SENT"] } },
      include: { person: { select: { slug: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    members: users.map((user) => ({
      id: user.id,
      name: user.person?.displayName ?? "No profile yet",
      personSlug: user.person?.slug ?? null,
      phone: formatPhone(user.phone),
      email: user.email,
      role: user.role,
      lastSeenAt: user.lastSeenAt,
    })),
    invites: invites.map((invite) => ({
      id: invite.id,
      name: invite.person.displayName,
      personSlug: invite.person.slug,
      phone: formatPhone(invite.phone),
      email: invite.email,
      role: invite.role,
      state: inviteState(invite),
      expiresAt: invite.expiresAt,
      path: invite.token ? `/join/${invite.token}` : null,
    })),
  };
}

export type InviteResult =
  { ok: true; id: string } | { ok: false; errors: InviteErrors; message?: string };

/**
 * Invites someone: makes (or reuses) their person, and a link for the admin to
 * send by hand. Nothing is texted or emailed here. Inviting the same number
 * again updates the invite and keeps its link.
 */
export async function createInvite(actor: Actor, form: InviteFormInput): Promise<InviteResult> {
  assertCan(actor, "admin");
  const parsed = parseInviteForm(form);
  if (!parsed.ok) return parsed;
  const { values } = parsed;
  const db = getDb();

  if (await db.user.findUnique({ where: { phone: values.phone }, select: { id: true } })) {
    return { ok: false, errors: { phone: "Someone with this number is already a member." } };
  }

  let personId: string;
  if (values.personSlug) {
    const person = await db.person.findUnique({
      where: { slug: values.personSlug },
      select: { id: true, user: { select: { id: true } } },
    });
    if (!person) return { ok: false, errors: { person: "That person is no longer in the chest." } };
    if (person.user)
      return { ok: false, errors: { person: "That person already has an account." } };
    personId = person.id;
  } else {
    const blank = {
      givenName: "",
      familyName: "",
      birthFamilyName: "",
      nicknames: "",
      alternateNames: "",
      gender: "",
      living: "yes",
      born: "",
      died: "",
      notes: "",
    };
    const created = await createPerson(actor, { ...blank, displayName: values.name! });
    if (!created.ok)
      return {
        ok: false,
        errors: { name: created.errors.displayName ?? "That name will not do." },
      };
    personId = (
      await db.person.findUniqueOrThrow({ where: { slug: created.slug }, select: { id: true } })
    ).id;
  }

  const fields = {
    personId,
    email: values.email,
    role: values.role,
    status: "PENDING" as const,
    expiresAt: expiry(),
    invitedById: actor.kind === "user" ? actor.userId : null,
  };
  const open = await db.invite.findFirst({
    where: { phone: values.phone, status: { in: ["PENDING", "SENT"] } },
    select: { id: true, token: true },
  });
  if (open) {
    // An old invite made before links were kept gets a link now.
    const token = open.token ?? randomToken();
    await db.invite.update({
      where: { id: open.id },
      data: { ...fields, token, tokenHash: hashToken(token) },
    });
    return { ok: true, id: open.id };
  }
  const token = randomToken();
  const invite = await db.invite.create({
    data: { ...fields, phone: values.phone, token, tokenHash: hashToken(token) },
  });
  return { ok: true, id: invite.id };
}

/** Stops an invite's link from working. The person stays in the chest. */
export async function revokeInvite(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "admin");
  await getDb().invite.updateMany({
    where: { id, status: { in: ["PENDING", "SENT"] } },
    data: { status: "REVOKED" },
  });
}

/** Gives an invite another 30 days. The link stays the same. */
export async function renewInvite(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "admin");
  await getDb().invite.updateMany({
    where: { id, status: { in: ["PENDING", "SENT"] } },
    data: { expiresAt: expiry() },
  });
}

export interface JoinView {
  state: InviteState;
  /** Shown only while the invite is open. */
  name: string | null;
  /** "•••• 0142": enough to recognise their own number, no more. */
  phoneHint: string | null;
}

/**
 * What the join page may show for a link. Public: holding the link is the
 * only credential, so it reveals a first name's worth and four digits, and
 * nothing once the invite is no longer open. Null for a link that never existed.
 */
export async function getJoin(
  token: string,
): Promise<(JoinView & { phone: string | null }) | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const invite = await getDb().invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: { select: { displayName: true } } },
  });
  if (!invite) return null;
  const state = inviteState(invite);
  const open = state === "open";
  return {
    state,
    name: open ? invite.person.displayName : null,
    phoneHint: open ? maskPhone(invite.phone) : null,
    // For the server only: the number the code is sent to. Never rendered.
    phone: open ? invite.phone : null,
  };
}
