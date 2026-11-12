"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parseBox } from "@/lib/photos/box";
import { requireActor } from "@/server/auth/session";
import {
  deletePhoto,
  setTagBox,
  updatePhoto,
  type PhotoErrors,
  type PhotoFormInput,
} from "@/server/photos/service";
import { addComment, deleteComment, toggleReaction } from "@/server/photos/talk";

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

export interface CommentState {
  /** What they typed, kept when it could not be posted. */
  text: string;
  message: string | null;
}

/** Everyone who can see a photo can talk about it. */
export async function addCommentAction(_: CommentState, form: FormData): Promise<CommentState> {
  const actor = await requireActor("read");
  const text = String(form.get("body") ?? "");
  const result = await addComment(actor, String(form.get("photoId") ?? ""), text);
  if (!result.ok) return { text, message: result.message };
  refresh();
  return { text: "", message: null };
}

export async function deleteCommentAction(form: FormData): Promise<void> {
  const actor = await requireActor("read");
  await deleteComment(actor, String(form.get("commentId") ?? ""));
  refresh();
}

export async function reactAction(form: FormData): Promise<void> {
  const actor = await requireActor("read");
  await toggleReaction(actor, String(form.get("photoId") ?? ""), String(form.get("emoji") ?? ""));
  refresh();
}

/** Marks where a tagged person is in the photo; `box` null clears the mark. */
export async function setTagBoxAction(
  photoId: string,
  personSlug: string,
  box: unknown,
): Promise<void> {
  const actor = await requireActor("write");
  const parsed = box === null ? null : parseBox(box);
  // A box that cannot be read is ignored rather than clearing the one already there.
  if (box !== null && !parsed) return;
  await setTagBox(actor, photoId, personSlug, parsed);
  refresh();
}
