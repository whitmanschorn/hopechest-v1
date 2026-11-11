"use server";

import { redirect } from "next/navigation";
import type { PersonErrors, PersonFormInput } from "@/lib/people/personEdit";
import { requireActor } from "@/server/auth/session";
import {
  addRelationship,
  createPerson,
  removeRelationship,
  updatePerson,
  type RelationInput,
} from "@/server/people/service";

export interface PersonFormState {
  /** What was typed, so a failed save does not clear the form. */
  input: PersonFormInput;
  errors: PersonErrors;
  message?: string;
}

const FIELDS = [
  "displayName",
  "givenName",
  "familyName",
  "birthFamilyName",
  "nicknames",
  "alternateNames",
  "gender",
  "living",
  "born",
  "died",
  "notes",
] as const satisfies readonly (keyof PersonFormInput)[];

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

function readRelation(form: FormData): RelationInput | undefined {
  const otherSlug = field(form, "relativeOf");
  if (!otherSlug) return undefined;
  return {
    role: field(form, "relativeRole"),
    otherSlug,
    qualifier: field(form, "relativeQualifier"),
  };
}

export async function savePersonAction(
  _: PersonFormState,
  form: FormData,
): Promise<PersonFormState> {
  const actor = await requireActor("write");
  const input = Object.fromEntries(
    FIELDS.map((name) => [name, field(form, name)]),
  ) as unknown as PersonFormInput;
  const slug = field(form, "slug");
  const result = slug
    ? await updatePerson(actor, slug, input)
    : await createPerson(actor, input, readRelation(form));
  if (!result.ok) return { input, errors: result.errors, message: result.message };
  redirect(`/people/${result.slug}`);
}

export interface RelativeFormState {
  message?: string;
}

export async function addRelativeAction(
  _: RelativeFormState,
  form: FormData,
): Promise<RelativeFormState> {
  const actor = await requireActor("write");
  const slug = field(form, "slug");
  const other = field(form, "otherSlug");
  if (!other) return { message: "Choose a person." };
  const result = await addRelationship(actor, slug, {
    role: field(form, "role"),
    otherSlug: other,
    qualifier: field(form, "qualifier"),
    endReason: field(form, "endReason") || undefined,
  });
  if (!result.ok) return { message: result.message };
  redirect(`/people/${slug}`);
}

export async function removeRelationshipAction(form: FormData): Promise<void> {
  const actor = await requireActor("write");
  await removeRelationship(actor, field(form, "relationshipId"));
  redirect(`/people/${field(form, "slug")}`);
}
