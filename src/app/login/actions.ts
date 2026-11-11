"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizePhone } from "@/lib/auth/phone";
import { endSession, requestCode, verifyCode } from "@/server/auth/service";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "@/server/auth/session";

export type LoginState =
  | { step: "phone"; error?: string }
  | { step: "code"; phone: string; devCode?: string; error?: string };

const MESSAGES = {
  rate_limited: "Too many tries. Wait an hour and try again.",
  unavailable: "Text messages aren't set up here yet, so this number can't sign in.",
  wrong_code: "That code didn't work. Check it, or ask for a new one.",
} as const;

export async function requestCodeAction(_: LoginState, form: FormData): Promise<LoginState> {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: "Enter a mobile number, with area code." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const result = await requestCode(phone, ip);
  if (!result.ok) return { step: "phone", error: MESSAGES[result.reason] };
  return { step: "code", phone, devCode: result.devCode };
}

export async function verifyCodeAction(state: LoginState, form: FormData): Promise<LoginState> {
  if (state.step !== "code") return { step: "phone" };
  if (form.get("intent") === "back") return { step: "phone" };

  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const userAgent = (await headers()).get("user-agent");
  const result = await verifyCode(state.phone, code, userAgent);
  if (!result.ok) return { ...state, error: MESSAGES[result.reason] };

  await setSessionCookie(result.sessionToken, result.expiresAt);
  redirect("/home");
}

export async function signOutAction(): Promise<void> {
  const token = await readSessionCookie();
  if (token) await endSession(token);
  await clearSessionCookie();
  redirect("/");
}
