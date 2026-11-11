"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestCode, verifyCode } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/session";
import { getJoin } from "@/server/invites/service";

export type JoinState =
  | { step: "start"; error?: string }
  | { step: "code"; devCode?: string; error?: string }
  | { step: "gone" };

const MESSAGES = {
  rate_limited: "Too many tries. Wait an hour and try again.",
  unavailable: "Text messages aren't set up on this site yet. Ask whoever invited you.",
  wrong_code: "That code didn't work. Check it, or ask for a new one.",
} as const;

/** Texts the sign-in code to the phone on the invite. The link decides the number; nothing is typed. */
export async function joinSendCodeAction(token: string): Promise<JoinState> {
  const join = await getJoin(token);
  if (!join?.phone) return { step: "gone" };
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const result = await requestCode(join.phone, ip);
  if (!result.ok) return { step: "start", error: MESSAGES[result.reason] };
  return { step: "code", devCode: result.devCode };
}

/** Checks the code. Right: the invite becomes a membership and they are signed in. */
export async function joinVerifyAction(
  token: string,
  state: JoinState,
  form: FormData,
): Promise<JoinState> {
  if (state.step !== "code") return { step: "start" };
  if (form.get("intent") === "resend") return joinSendCodeAction(token);
  const join = await getJoin(token);
  if (!join?.phone) return { step: "gone" };

  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const result = await verifyCode(join.phone, code, (await headers()).get("user-agent"));
  if (!result.ok) return { ...state, error: MESSAGES[result.reason] };
  await setSessionCookie(result.sessionToken, result.expiresAt);
  redirect("/welcome");
}
