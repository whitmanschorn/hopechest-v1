import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getChestConfig } from "@/lib/chest";
import { can, type Actor, type Permission } from "@/server/actor";
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

/**
 * The Actor to hand to service functions on behalf of the signed-in user.
 * Someone without the permission gets the not-found page: to them the page
 * does not exist. (Services still check for themselves with assertCan.)
 */
export async function requireActor(permission: Permission = "read"): Promise<Actor> {
  const user = await requireUser();
  const actor: Actor = { kind: "user", userId: user.id, role: user.role, personId: user.personId };
  if (!can(actor, permission)) notFound();
  return actor;
}

/**
 * The signed-in user's Actor, or null. For route handlers, which answer 401
 * themselves instead of redirecting to the sign-in page.
 */
export async function currentActor(): Promise<Actor | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { kind: "user", userId: user.id, role: user.role, personId: user.personId };
}
