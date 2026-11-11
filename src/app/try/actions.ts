"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkDemoPassword, demoPeople, startDemoSession } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/session";

export type TryState =
  | { step: "password"; error?: string }
  | { step: "pick"; password: string; people: { value: string; label: string }[]; error?: string };

const MESSAGES = {
  wrong: "That password didn't work.",
  rate_limited: "Too many tries. Wait an hour and try again.",
  closed: "This site has no demo door.",
} as const;

async function address(): Promise<string | null> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** Step one: the password. Only then is anyone's name shown. */
export async function demoPasswordAction(_: TryState, form: FormData): Promise<TryState> {
  const password = String(form.get("password") ?? "");
  const result = await checkDemoPassword(password, await address());
  if (result !== "ok") return { step: "password", error: MESSAGES[result] };
  return { step: "pick", password, people: await demoPeople() };
}

/** Step two: who to be. The password is checked again; nothing is trusted from step one. */
export async function demoStartAction(state: TryState, form: FormData): Promise<TryState> {
  if (state.step !== "pick") return { step: "password" };
  const result = await checkDemoPassword(state.password, await address());
  if (result !== "ok") return { step: "password", error: MESSAGES[result] };

  const person = String(form.get("person") ?? "");
  if (!person) return { ...state, error: "Choose someone." };
  const userAgent = (await headers()).get("user-agent");
  const started = await startDemoSession(person, String(form.get("role") ?? ""), userAgent);
  if (!started.ok) return { ...state, error: "Choose someone from the list." };

  await setSessionCookie(started.sessionToken, started.expiresAt);
  redirect("/home");
}
