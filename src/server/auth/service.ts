import { parsePhoneList } from "@/lib/auth/phone";
import { allows, LIMITS, type Limit } from "@/lib/auth/rateLimit";
import { hashToken, randomToken } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db";
import { getSmsSettings, smsProviderFor } from "@/server/sms";
import { isTestPhone } from "@/server/sms/provider";

export const SESSION_DAYS = 30;

/** Uses up one attempt against `key`; false when the limit is already reached. */
async function takeAttempt(key: string, limit: Limit): Promise<boolean> {
  const db = getDb();
  const since = new Date(Date.now() - limit.windowMs);
  const earlier = await db.authAttempt.findMany({
    where: { key, createdAt: { gt: since } },
    select: { createdAt: true },
  });
  if (
    !allows(
      limit,
      earlier.map((row) => row.createdAt),
    )
  )
    return false;
  await db.authAttempt.create({ data: { key } });
  return true;
}

function adminPhones(): string[] {
  return parsePhoneList(process.env.ADMIN_PHONES);
}

/** Only people already in the chest can sign in: members, invitees, and the
 * admins named in ADMIN_PHONES (how the first account gets created). */
async function mayRequestCode(phone: string): Promise<boolean> {
  if (adminPhones().includes(phone)) return true;
  const db = getDb();
  const user = await db.user.findUnique({ where: { phone }, select: { disabledAt: true } });
  if (user) return user.disabledAt === null;
  const invite = await db.invite.findFirst({
    where: { phone, status: { in: ["PENDING", "SENT"] }, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return invite !== null;
}

export type RequestCodeResult =
  { ok: true; devCode?: string } | { ok: false; reason: "rate_limited" | "unavailable" };

/**
 * Sends a login code. For a number that is not in the chest this reports
 * success and sends nothing, so the form cannot be used to find out who is a
 * member.
 */
export async function requestCode(phone: string, ip: string | null): Promise<RequestCodeResult> {
  const settings = getSmsSettings();
  const provider = smsProviderFor(phone, settings);
  if (!provider) return { ok: false, reason: "unavailable" };

  // Test numbers skip limits so specs can run repeatedly; they never exist in production.
  if (!isTestPhone(settings, phone)) {
    const allowed =
      (await takeAttempt(`code:${phone}`, LIMITS.codePerPhone)) &&
      (ip === null || (await takeAttempt(`ip:${ip}`, LIMITS.codePerIp)));
    if (!allowed) return { ok: false, reason: "rate_limited" };
  }

  if (!(await mayRequestCode(phone))) return { ok: true };
  const { devCode } = await provider.startVerification(phone);
  return { ok: true, devCode };
}

export type VerifyCodeResult =
  | { ok: true; sessionToken: string; expiresAt: Date; onboarded: boolean }
  | { ok: false; reason: "wrong_code" | "rate_limited" };

export async function verifyCode(
  phone: string,
  code: string,
  userAgent: string | null,
): Promise<VerifyCodeResult> {
  const settings = getSmsSettings();
  const provider = smsProviderFor(phone, settings);
  if (!provider || !/^\d{4,8}$/.test(code)) return { ok: false, reason: "wrong_code" };

  if (
    !isTestPhone(settings, phone) &&
    !(await takeAttempt(`verify:${phone}`, LIMITS.verifyPerPhone))
  ) {
    return { ok: false, reason: "rate_limited" };
  }
  if (!(await mayRequestCode(phone))) return { ok: false, reason: "wrong_code" };
  if (!(await provider.checkVerification(phone, code))) return { ok: false, reason: "wrong_code" };

  const user = await findOrCreateUser(phone);
  if (!user) return { ok: false, reason: "wrong_code" };

  const sessionToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const db = getDb();
  await db.session.create({
    data: { tokenHash: hashToken(sessionToken), userId: user.id, userAgent, expiresAt },
  });
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  return { ok: true, sessionToken, expiresAt, onboarded: user.onboardedAt !== null };
}

/** The phone is verified: return its account, creating one from an open invite
 * or from ADMIN_PHONES if this is the first sign-in. */
async function findOrCreateUser(phone: string) {
  const db = getDb();
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) return existing.disabledAt ? null : existing;

  const invite = await db.invite.findFirst({
    where: { phone, status: { in: ["PENDING", "SENT"] }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const isAdmin = adminPhones().includes(phone);
  if (!invite && !isAdmin) return null;

  try {
    return db.$transaction(async (tx) => {
      // Someone may already hold the invited person's account under an older number.
      const personTaken = invite
        ? await tx.user.findUnique({ where: { personId: invite.personId }, select: { id: true } })
        : null;
      const user = await tx.user.create({
        data: {
          phone,
          role: isAdmin ? "ADMIN" : invite!.role,
          personId: invite && !personTaken ? invite.personId : null,
        },
      });
      if (invite) {
        await tx.invite.update({
          where: { id: invite.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });
      }
      return user;
    });
  } catch (error) {
    // Two sign-ins for the same new number at once: the other one created the account.
    const created = await db.user.findUnique({ where: { phone } });
    if (created && !created.disabledAt) return created;
    throw error;
  }
}

export async function endSession(sessionToken: string): Promise<void> {
  await getDb().session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
}

/** The signed-in user for a session cookie value, or null. */
export async function userForSession(sessionToken: string) {
  const session = await getDb().session.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || session.user.disabledAt) return null;
  return session.user;
}
