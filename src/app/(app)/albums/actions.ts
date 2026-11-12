"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import {
  createAlbum,
  deleteAlbum,
  updateAlbum,
  type AlbumErrors,
  type AlbumFormInput,
} from "@/server/albums/service";

export interface AlbumFormState {
  input: AlbumFormInput;
  errors: AlbumErrors;
}

/** Creates an album, or saves one when the form carries its id. */
export async function saveAlbumAction(_: AlbumFormState, form: FormData): Promise<AlbumFormState> {
  const actor = await requireActor("write");
  const id = String(form.get("id") ?? "");
  const input: AlbumFormInput = {
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    cover: String(form.get("cover") ?? ""),
  };
  if (id) {
    const saved = await updateAlbum(actor, id, input);
    if (!saved.ok) return { input, errors: saved.errors };
    redirect(`/albums/${id}`);
  }
  const created = await createAlbum(actor, input);
  if (!created.ok) return { input, errors: created.errors };
  redirect(`/albums/${created.id}`);
}

export async function deleteAlbumAction(form: FormData): Promise<void> {
  const actor = await requireActor("write");
  await deleteAlbum(actor, String(form.get("id") ?? ""));
  redirect("/albums");
}
