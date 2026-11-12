"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/session";
import {
  addFact,
  createPageNode,
  createPredicate,
  deleteFact,
  searchNodes,
  setNodeKind,
  updateFact,
  type FactErrors,
  type FactInput,
  type NodeRef,
  type PredicateErrors,
} from "@/server/graph/service";

export async function addFactAction(
  input: FactInput,
): Promise<{ ok: true } | { ok: false; errors: FactErrors }> {
  const actor = await requireActor("write");
  const result = await addFact(actor, input);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

export async function removeFactAction(id: string): Promise<void> {
  const actor = await requireActor("write");
  await deleteFact(actor, id);
  refresh();
}

export async function rankFactAction(id: string, rank: string): Promise<void> {
  const actor = await requireActor("write");
  await updateFact(actor, id, { rank });
  refresh();
}

/** For the picker in the fact form: nodes by name, of the kinds the fact can point at. */
export async function searchNodesAction(q: string, kinds: string[]): Promise<NodeRef[]> {
  const actor = await requireActor("read");
  return searchNodes(actor, { q, kinds, limit: 12 });
}

export async function createPageNodeAction(
  name: string,
  kind: string,
): Promise<{ ok: true; node: NodeRef } | { ok: false; message: string }> {
  const actor = await requireActor("write");
  return createPageNode(actor, { name, kind });
}

export async function setKindAction(key: string, kind: string): Promise<void> {
  const actor = await requireActor("write");
  await setNodeKind(actor, key, kind);
  refresh();
}

export interface PredicateFormState {
  errors: PredicateErrors;
  /** Label of the kind of fact just added. */
  added: string | null;
}

export async function createPredicateAction(
  _: PredicateFormState,
  form: FormData,
): Promise<PredicateFormState> {
  const actor = await requireActor("admin");
  const list = (name: string) =>
    String(form.get(name) ?? "")
      .split(",")
      .filter(Boolean);
  const label = String(form.get("label") ?? "");
  const result = await createPredicate(actor, {
    label,
    inverse: String(form.get("inverse") ?? ""),
    description: String(form.get("description") ?? ""),
    value: String(form.get("value") ?? ""),
    subjects: list("subjects"),
    objects: list("objects"),
    symmetric: form.get("symmetric") === "on",
  });
  if (!result.ok) return { errors: result.errors, added: null };
  refresh();
  return { errors: {}, added: label.trim() };
}
