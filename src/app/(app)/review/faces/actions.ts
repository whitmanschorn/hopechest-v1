"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/session";
import { ignoreFaces, nameFaces, rejectFaces } from "@/server/faces/service";

export interface FaceResult {
  ok: boolean;
  message: string;
}

const faces = (count: number) => (count === 1 ? "1 face" : `${count} faces`);

export async function nameFacesAction(faceIds: string[], person: string): Promise<FaceResult> {
  const actor = await requireActor("write");
  const result = await nameFaces(actor, { faceIds, person });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: `Named ${faces(result.count)}.` };
}

export async function rejectFacesAction(faceIds: string[], person: string): Promise<FaceResult> {
  const actor = await requireActor("write");
  const result = await rejectFaces(actor, { faceIds, person });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Noted." };
}

export async function ignoreFacesAction(faceIds: string[]): Promise<FaceResult> {
  const actor = await requireActor("write");
  const result = await ignoreFaces(actor, { faceIds });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: `Set ${faces(result.count)} aside.` };
}
