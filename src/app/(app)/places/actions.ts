"use server";

import { redirect } from "next/navigation";
import type { PlaceErrors, PlaceFormInput } from "@/lib/places/placeEdit";
import { requireActor } from "@/server/auth/session";
import { createPlace, deletePlace, updatePlace } from "@/server/places/service";

export interface PlaceFormState {
  /** What was typed, so a failed save does not clear the form. */
  input: PlaceFormInput;
  errors: PlaceErrors;
  message?: string;
}

const FIELDS = [
  "label",
  "street",
  "city",
  "region",
  "country",
  "lat",
  "lng",
  "notes",
] as const satisfies readonly (keyof PlaceFormInput)[];

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function savePlaceAction(_: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  const actor = await requireActor("write");
  const input = Object.fromEntries(
    FIELDS.map((name) => [name, field(form, name)]),
  ) as unknown as PlaceFormInput;
  const slug = field(form, "slug");
  const result = slug ? await updatePlace(actor, slug, input) : await createPlace(actor, input);
  if (!result.ok) return { input, errors: result.errors, message: result.message };
  redirect(`/places/${result.slug}`);
}

export async function deletePlaceAction(form: FormData): Promise<void> {
  const actor = await requireActor("write");
  await deletePlace(actor, field(form, "slug"));
  redirect("/places");
}
