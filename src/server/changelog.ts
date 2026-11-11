import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/server/actor";

export interface Change {
  field: string;
  before: string | null;
  after: string | null;
}

/** Writes edit-history rows. Call inside the transaction that makes the edit. */
export async function recordChanges(
  tx: Prisma.TransactionClient,
  actor: Actor,
  entityType: "person" | "event" | "place",
  entityId: string,
  changes: readonly Change[],
): Promise<void> {
  if (changes.length === 0) return;
  await tx.changelog.createMany({
    data: changes.map((change) => ({
      entityType,
      entityId,
      ...change,
      actorUserId: actor.kind === "user" ? actor.userId : null,
      actorApiKeyId: actor.kind === "apiKey" ? actor.apiKeyId : null,
    })),
  });
}
