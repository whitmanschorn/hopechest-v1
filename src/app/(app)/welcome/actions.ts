"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { saveOwnProfile } from "@/server/people/service";

export interface WelcomeState {
  input: { displayName: string; born: string };
  errors: { displayName?: string; born?: string };
}

export async function saveWelcomeAction(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const actor = await requireActor("read");
  const input = {
    displayName: String(form.get("displayName") ?? ""),
    born: String(form.get("born") ?? ""),
  };
  const result = await saveOwnProfile(actor, input);
  if (!result.ok) return { input, errors: result.errors };
  redirect("/home");
}
