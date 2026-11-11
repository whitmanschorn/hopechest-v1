/**
 * The demo door: on a test site, someone with the demo password can sign in
 * as any family member and look around as them. Pure decision logic, so the
 * rules that matter (never in production, never without a real password) are
 * unit-tested.
 */

export type RoleName = "ADMIN" | "CONTRIBUTOR" | "VIEWER";

/** Access levels a demo visitor may choose. Never full admin. */
export const DEMO_ROLES = ["VIEWER", "CONTRIBUTOR"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

/** Shorter passwords are refused outright, so a blank or lazy setting opens nothing. */
export const MIN_DEMO_PASSWORD = 12;

/** Whether this deployment has a demo door at all. */
export function demoDoorOpen(env: string, password: string | undefined): boolean {
  return env !== "production" && (password?.trim().length ?? 0) >= MIN_DEMO_PASSWORD;
}

export interface RealIdentity {
  role: RoleName;
  personId: string | null;
}

export interface SessionViewAs {
  actingPersonId: string | null;
  actingRole: RoleName | null;
}

export interface EffectiveIdentity {
  role: RoleName;
  personId: string | null;
  /** True for a demo session standing in for a family member. */
  viewingAs: boolean;
}

/**
 * Who a session counts as for kinship labels and permissions. Only the demo
 * door writes the "acting" fields. In production they are ignored whatever
 * they hold, and they can never grant full admin.
 */
export function effectiveIdentity(
  real: RealIdentity,
  session: SessionViewAs,
  env: string,
): EffectiveIdentity {
  if (!session.actingPersonId || env === "production") {
    return { role: real.role, personId: real.personId, viewingAs: false };
  }
  const role = session.actingRole === "CONTRIBUTOR" ? "CONTRIBUTOR" : "VIEWER";
  return { role, personId: session.actingPersonId, viewingAs: true };
}
