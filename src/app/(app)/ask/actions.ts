"use server";

import { redirect } from "next/navigation";
import { deleteConversation } from "@/server/ask/service";
import { requireActor } from "@/server/auth/session";

export async function deleteConversationAction(id: string): Promise<void> {
  const actor = await requireActor("read");
  await deleteConversation(actor, id);
  redirect("/ask");
}
