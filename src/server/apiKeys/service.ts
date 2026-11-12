import { hashToken, randomToken } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db";
import { assertCan, type Actor } from "@/server/actor";
import { memberName } from "@/server/memberName";

/**
 * API keys let programs (Claude in a terminal, the command-line tool, scripts)
 * read and change the chest. A key is shown once, when made; only its hash is
 * kept. Each belongs to this one deployment.
 */

/** What a key may do. Each level includes the ones before it. */
export const ACCESS_LEVELS = {
  read: { label: "Read only", scopes: ["read"] },
  write: { label: "Read and change", scopes: ["read", "write"] },
  ingest: { label: "Read, change and bulk upload", scopes: ["read", "write", "ingest"] },
} as const;
export type AccessLevel = keyof typeof ACCESS_LEVELS;

export const KEY_PREFIX = "hc_";

export interface ApiKeyView {
  id: string;
  name: string;
  /** The first characters of the key, to tell keys apart. */
  prefix: string;
  access: string;
  createdBy: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const accessLabel = (scopes: readonly string[]) =>
  scopes.includes("ingest")
    ? ACCESS_LEVELS.ingest.label
    : scopes.includes("write")
      ? ACCESS_LEVELS.write.label
      : ACCESS_LEVELS.read.label;

export async function listApiKeys(actor: Actor): Promise<ApiKeyView[]> {
  assertCan(actor, "admin");
  const keys = await getDb().apiKey.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { createdBy: { select: { phone: true, person: { select: { displayName: true } } } } },
  });
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    access: accessLabel(key.scopes),
    createdBy: key.createdBy ? memberName(key.createdBy) : null,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
  }));
}

export type CreateKeyResult =
  | { ok: true; key: string; name: string }
  | { ok: false; errors: { name?: string; access?: string } };

/** Makes a key. The full key is in the result and nowhere else, ever again. */
export async function createApiKey(
  actor: Actor,
  input: { name: string; access: string },
): Promise<CreateKeyResult> {
  assertCan(actor, "admin");
  const name = input.name.trim();
  const errors: { name?: string; access?: string } = {};
  if (!name) errors.name = "Say what the key is for, so you can tell it apart later.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (!Object.hasOwn(ACCESS_LEVELS, input.access)) errors.access = "Pick one of the choices.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const key = KEY_PREFIX + randomToken();
  await getDb().apiKey.create({
    data: {
      name,
      prefix: key.slice(0, 9),
      keyHash: hashToken(key),
      scopes: [...ACCESS_LEVELS[input.access as AccessLevel].scopes],
      createdById: actor.kind === "user" ? actor.userId : null,
    },
  });
  return { ok: true, key, name };
}

/** Stops a key working, at once and for good. The row is kept for the edit history. */
export async function revokeApiKey(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "admin");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await getDb().apiKey.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** How stale "last used" may get before it is written again. */
const TOUCH_EVERY_MS = 60_000;

/** The Actor for a presented key, or null if it is unknown or revoked. */
export async function actorForApiKey(presented: string): Promise<Actor | null> {
  if (!presented.startsWith(KEY_PREFIX) || presented.length > 200) return null;
  const db = getDb();
  const key = await db.apiKey.findUnique({
    where: { keyHash: hashToken(presented) },
    select: { id: true, scopes: true, revokedAt: true, lastUsedAt: true },
  });
  if (!key || key.revokedAt) return null;
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.apiKey.updateMany({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }
  return { kind: "apiKey", apiKeyId: key.id, scopes: key.scopes };
}
