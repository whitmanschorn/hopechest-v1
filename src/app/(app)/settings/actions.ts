"use server";

import { refresh } from "next/cache";
import { createApiKey, revokeApiKey } from "@/server/apiKeys/service";
import { requireActor } from "@/server/auth/session";

export interface ApiKeyFormState {
  input: { name: string; access: string };
  errors: { name?: string; access?: string };
  /** The new key, right after it is made. It is never shown again. */
  created: { key: string; name: string } | null;
}

export async function createApiKeyAction(
  _: ApiKeyFormState,
  form: FormData,
): Promise<ApiKeyFormState> {
  const actor = await requireActor("admin");
  const input = { name: String(form.get("name") ?? ""), access: String(form.get("access") ?? "") };
  const result = await createApiKey(actor, input);
  if (!result.ok) return { input, errors: result.errors, created: null };
  refresh();
  return {
    input: { name: "", access: input.access },
    errors: {},
    created: { key: result.key, name: result.name },
  };
}

export async function revokeApiKeyAction(form: FormData): Promise<void> {
  const actor = await requireActor("admin");
  await revokeApiKey(actor, String(form.get("id") ?? ""));
  refresh();
}
