"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/session";
import { acceptClaim, rejectClaim } from "@/server/claims/service";

export interface DecisionResult {
  ok: boolean;
  message: string;
}

export async function acceptClaimAction(id: string): Promise<DecisionResult> {
  const actor = await requireActor("write");
  const result = await acceptClaim(actor, id);
  if (!result.ok) {
    const fields = Object.values(result.fields ?? {}).join(" ");
    return { ok: false, message: [result.message, fields].filter(Boolean).join(" ") };
  }
  refresh();
  return { ok: true, message: "Accepted." };
}

export async function rejectClaimAction(id: string, note: string): Promise<DecisionResult> {
  const actor = await requireActor("write");
  const result = await rejectClaim(actor, id, note);
  if (!result.ok) return { ok: false, message: result.message };
  refresh();
  return { ok: true, message: "Rejected." };
}
