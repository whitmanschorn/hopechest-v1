"use server";

import { redirect } from "next/navigation";
import { readParticipants, type EventErrors, type EventFormInput } from "@/lib/events/eventEdit";
import { requireActor } from "@/server/auth/session";
import { createEvent, deleteEvent, updateEvent } from "@/server/events/service";

export interface EventFormState {
  /** What was entered, so a failed save does not clear the form. */
  input: EventFormInput;
  errors: EventErrors;
  message?: string;
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function saveEventAction(_: EventFormState, form: FormData): Promise<EventFormState> {
  const actor = await requireActor("write");
  const input: EventFormInput = {
    kind: field(form, "kind"),
    title: field(form, "title"),
    description: field(form, "description"),
    date: field(form, "date"),
    deduced: field(form, "deduced"),
    clue: field(form, "clue"),
    place: field(form, "place"),
    participants: readParticipants(form.getAll("participant").map(String)),
  };
  const id = field(form, "id");
  const result = id ? await updateEvent(actor, id, input) : await createEvent(actor, input);
  if (!result.ok) return { input, errors: result.errors, message: result.message };
  redirect(`/events/${result.id}`);
}

export async function deleteEventAction(form: FormData): Promise<void> {
  const actor = await requireActor("write");
  await deleteEvent(actor, field(form, "id"));
  redirect("/timeline");
}
