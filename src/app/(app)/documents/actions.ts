"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import {
  createDocument,
  deleteDocument,
  updateDocument,
  type DocumentErrors,
  type DocumentFormInput,
} from "@/server/documents/service";

export interface DocumentFormState {
  input: DocumentFormInput;
  errors: DocumentErrors;
}

/** Adds a document, or saves one when the form carries its id. */
export async function saveDocumentAction(
  _: DocumentFormState,
  form: FormData,
): Promise<DocumentFormState> {
  const actor = await requireActor("write");
  const id = String(form.get("id") ?? "");
  const input: DocumentFormInput = {
    title: String(form.get("title") ?? ""),
    kind: String(form.get("kind") ?? ""),
    date: String(form.get("date") ?? ""),
    text: String(form.get("text") ?? ""),
  };
  if (id) {
    const saved = await updateDocument(actor, id, input);
    if (!saved.ok) return { input, errors: saved.errors };
    redirect(`/documents/${id}`);
  }
  const created = await createDocument(actor, {
    ...input,
    fileKey: String(form.get("fileKey") ?? "") || undefined,
    filename: String(form.get("filename") ?? "") || undefined,
  });
  if (!created.ok) return { input, errors: created.errors };
  redirect(`/documents/${created.id}${created.duplicate ? "?already=1" : ""}`);
}

export async function deleteDocumentAction(form: FormData): Promise<void> {
  const actor = await requireActor("write");
  const id = String(form.get("id") ?? "");
  const result = await deleteDocument(actor, id);
  redirect(result.ok ? "/documents" : `/documents/${id}/edit`);
}
