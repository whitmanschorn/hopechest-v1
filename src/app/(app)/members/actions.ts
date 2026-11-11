"use server";

import { redirect } from "next/navigation";
import type { InviteErrors, InviteFormInput } from "@/lib/invites/inviteForm";
import { requireActor } from "@/server/auth/session";
import { createInvite, renewInvite, revokeInvite } from "@/server/invites/service";

export interface InviteFormState {
  input: InviteFormInput;
  errors: InviteErrors;
  message?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function inviteAction(_: InviteFormState, form: FormData): Promise<InviteFormState> {
  const actor = await requireActor("admin");
  const input: InviteFormInput = {
    name: text(form, "name"),
    person: text(form, "person"),
    email: text(form, "email"),
    phone: text(form, "phone"),
    role: text(form, "role"),
  };
  const result = await createInvite(actor, input);
  if (!result.ok) return { input, errors: result.errors, message: result.message };
  redirect(`/members?invited=${result.id}`);
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  await revokeInvite(await requireActor("admin"), text(form, "id"));
  redirect("/members");
}

export async function renewInviteAction(form: FormData): Promise<void> {
  const id = text(form, "id");
  await renewInvite(await requireActor("admin"), id);
  redirect(`/members?invited=${id}`);
}
