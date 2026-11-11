import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getChestConfig } from "@/lib/chest";
import { assertCan, type Actor, type Permission } from "@/server/actor";
import { userForSession } from "./service";

export const SESSION_COOKIE = "hopechest_session";

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Local development runs over plain http.
    secure: getChestConfig().env !== "development",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function readSessionCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null. Reads the request, so call it from a component
 * inside a <Suspense> boundary, a server action, or a route handler. Looked up
 * once per request however many components ask.
 */
export const getCurrentUser = cache(async () => {
  const token = await readSessionCookie();
  return token ? userForSession(token) : null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** The Actor to hand to service functions on behalf of the signed-in user. */
export async function requireActor(permission: Permission = "read"): Promise<Actor> {
  const user = await requireUser();
  const actor: Actor = { kind: "user", userId: user.id, role: user.role, personId: user.personId };
  assertCan(actor, permission);
  return actor;
}
