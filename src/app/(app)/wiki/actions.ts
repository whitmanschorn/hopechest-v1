"use server";

import { redirect } from "next/navigation";
import { historyPath, viewPath } from "@/lib/wiki/paths";
import { requireActor } from "@/server/auth/session";
import {
  deleteArticle,
  restoreRevision,
  saveArticle,
  type ArticleErrors,
  type ArticleRef,
} from "@/server/wiki/service";

export interface ArticleFormState {
  title: string;
  body: string;
  summary: string;
  errors: ArticleErrors;
}

function refFrom(form: FormData): ArticleRef | null {
  const kind = String(form.get("kind") ?? "");
  const slug = String(form.get("slug") ?? "");
  if (!slug) return null;
  return kind === "person" ? { kind: "person", slug } : { kind: "topic", slug };
}

/** Saves a page, or starts a new topic when the form names none. */
export async function saveArticleAction(
  _: ArticleFormState,
  form: FormData,
): Promise<ArticleFormState> {
  const actor = await requireActor("write");
  const state = {
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    summary: String(form.get("summary") ?? ""),
  };
  const ref = refFrom(form);
  const result = await saveArticle(actor, ref, {
    ...state,
    // Sent only when the page already existed when editing began.
    ...(form.has("base") ? { base: String(form.get("base")) || null } : {}),
  });
  if (!result.ok) return { ...state, errors: result.errors };
  redirect(viewPath(result.ref));
}

export async function restoreRevisionAction(form: FormData): Promise<void> {
  const actor = await requireActor("write");
  const ref = refFrom(form);
  if (!ref) return;
  await restoreRevision(actor, ref, String(form.get("revision") ?? ""));
  redirect(historyPath(ref));
}

export async function deleteArticleAction(form: FormData): Promise<void> {
  const actor = await requireActor("admin");
  const ref = refFrom(form);
  if (!ref) return;
  await deleteArticle(actor, ref);
  redirect(ref.kind === "person" ? viewPath(ref) : "/wiki");
}
