/**
 * "View as": an admin outside production can look at the chest as another
 * family member, to see what that person sees. Pure decision logic, so the
 * rule that matters (never in production, admins only) is unit-tested.
 */

export type RoleName = "ADMIN" | "CONTRIBUTOR" | "VIEWER";

export interface RealIdentity {
  role: RoleName;
  personId: string | null;
}

export interface SessionViewAs {
  actingPersonId: string | null;
  actingRole: RoleName | null;
}

/** Whether this account may use "view as" at all on this deployment. */
export function canViewAs(real: Pick<RealIdentity, "role">, env: string): boolean {
  return env !== "production" && real.role === "ADMIN";
}

export interface EffectiveIdentity {
  role: RoleName;
  personId: string | null;
  /** True while looking at the chest as someone else. */
  viewingAs: boolean;
}

/**
 * Who the session counts as for kinship labels and permissions. A stored
 * choice is ignored, not trusted, whenever the account may not use "view as".
 */
export function effectiveIdentity(
  real: RealIdentity,
  session: SessionViewAs,
  env: string,
): EffectiveIdentity {
  if (!session.actingPersonId || !canViewAs(real, env)) {
    return { role: real.role, personId: real.personId, viewingAs: false };
  }
  return {
    role: session.actingRole ?? real.role,
    personId: session.actingPersonId,
    viewingAs: true,
  };
}

export const ROLE_WORDS: Record<RoleName, string> = {
  ADMIN: "full access",
  CONTRIBUTOR: "can add and edit",
  VIEWER: "view only",
};
