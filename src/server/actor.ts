import type { Role } from "@/generated/prisma/enums";

/**
 * Who is doing something. Every service function takes an Actor and checks it,
 * so the web UI, REST, MCP and CLI all pass through the same permission rules.
 */
export type Actor =
  | { kind: "user"; userId: string; role: Role; personId: string | null }
  | { kind: "apiKey"; apiKeyId: string; scopes: readonly string[] };

export type Permission =
  /** Browse and comment. */
  | "read"
  /** Add and edit photos, documents, people and events. */
  | "write"
  /** Create ingest batches and upload in bulk. */
  | "ingest"
  /** Manage members, invites, API keys and settings. */
  | "admin";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  VIEWER: ["read"],
  CONTRIBUTOR: ["read", "write", "ingest"],
  ADMIN: ["read", "write", "ingest", "admin"],
};

export function can(actor: Actor, permission: Permission): boolean {
  if (actor.kind === "user") return ROLE_PERMISSIONS[actor.role].includes(permission);
  return actor.scopes.includes("admin") || actor.scopes.includes(permission);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`This needs "${permission}" permission`);
    this.name = "ForbiddenError";
  }
}

/** Call at the top of every service function. */
export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(permission);
}
