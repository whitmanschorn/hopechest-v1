"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/session";
import { datePhotos, discardPhotos, publishPhotos } from "@/server/ingest/service";

export interface ReviewResult {
  /** What happened, for the person reviewing. */
  message: string;
  ok: boolean;
}

const photos = (count: number) => (count === 1 ? "1 photo" : `${count} photos`);

/** Publishes the photos named, or with `null` everything still waiting in the batch. */
export async function publishAction(batchId: string, ids: string[] | null): Promise<ReviewResult> {
  const actor = await requireActor("write");
  const count = await publishPhotos(actor, batchId, ids ?? undefined);
  refresh();
  return { ok: true, message: `Published ${photos(count)}. The family can see them now.` };
}

export async function discardAction(batchId: string, ids: string[]): Promise<ReviewResult> {
  const actor = await requireActor("write");
  const count = await discardPhotos(actor, batchId, ids);
  refresh();
  return { ok: true, message: `Discarded ${photos(count)}.` };
}

export async function dateAction(
  batchId: string,
  ids: string[],
  text: string,
): Promise<ReviewResult> {
  const actor = await requireActor("write");
  const result = await datePhotos(actor, batchId, ids, text);
  if (!result.ok) return { ok: false, message: result.message };
  refresh();
  return { ok: true, message: `Dated ${photos(result.count)}.` };
}
