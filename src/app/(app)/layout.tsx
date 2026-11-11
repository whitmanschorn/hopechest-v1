import { Suspense, type ReactNode } from "react";
import { Center, Loader } from "@mantine/core";
import { signOutAction, stopViewAsAction, viewAsAction } from "@/app/login/actions";
import { AppFrame } from "@/components/AppFrame";
import { maskPhone } from "@/lib/auth/phone";
import { ROLE_WORDS } from "@/lib/auth/viewAs";
import { getChestConfig } from "@/lib/chest";
import { getDb } from "@/lib/db";
import { can, type Actor, type Permission } from "@/server/actor";
import { requireUser } from "@/server/auth/session";

const PERMISSIONS: readonly Permission[] = ["read", "write", "ingest", "admin"];

/** Everything under (app) is for signed-in family members only. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Center mih="100vh">
          <Loader />
        </Center>
      }
    >
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

// The session is read here, inside the boundary, so the shell around it can be
// prerendered. Pages still call requireActor() themselves before touching data.
async function SignedIn({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const person = user.personId
    ? await getDb().person.findUnique({
        where: { id: user.personId },
        select: { displayName: true, avatarUrl: true },
      })
    : null;
  const actor: Actor = { kind: "user", userId: user.id, role: user.role, personId: user.personId };
  // "View as" needs everyone's name for its picker; only admins outside production get it.
  const viewAs = user.canViewAs
    ? {
        people: (
          await getDb().person.findMany({
            select: { slug: true, displayName: true },
            orderBy: { displayName: "asc" },
          })
        ).map((option) => ({ value: option.slug, label: option.displayName })),
        current: user.viewingAs
          ? `${person?.displayName ?? "someone"} (${ROLE_WORDS[user.role]})`
          : null,
        start: viewAsAction,
        stop: stopViewAsAction,
      }
    : undefined;

  return (
    <AppFrame
      chestName={getChestConfig().name}
      signOut={signOutAction}
      viewAs={viewAs}
      user={{
        label: person?.displayName ?? maskPhone(user.phone),
        avatarUrl: person?.avatarUrl ?? null,
        role: user.role.toLowerCase(),
        permissions: PERMISSIONS.filter((permission) => can(actor, permission)),
      }}
    >
      {children}
    </AppFrame>
  );
}
