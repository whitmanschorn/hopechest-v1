"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import {
  deletePhoto,
  updatePhoto,
  type PhotoErrors,
  type PhotoFormInput,
} from "@/server/photos/service";

export interface PhotoFormState {
  input: PhotoFormInput;
  errors: PhotoErrors;
}

export async function savePhotoAction(_: PhotoFormState, form: FormData): Promise<PhotoFormState> {
  const actor = await requireActor("write");
  const id = String(form.get("id") ?? "");
  const input: PhotoFormInput = {
    caption: String(form.get("caption") ?? ""),
    date: String(form.get("date") ?? ""),
    photographer: String(form.get("photographer") ?? ""),
    // Mantine's MultiSelect submits one comma-separated field.
    people: String(form.get("people") ?? "")
      .split(",")
      .filter(Boolean),
  };
  const result = await updatePhoto(actor, id, input);
  if (!result.ok) return { input, errors: result.errors };
  redirect(`/photos/${id}`);
}

export async function deletePhotoAction(form: FormData): Promise<void> {
  const actor = await requireActor("write");
  await deletePhoto(actor, String(form.get("id") ?? ""));
  redirect("/photos");
}
