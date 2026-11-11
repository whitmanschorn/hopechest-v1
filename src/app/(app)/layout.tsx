import { Suspense, type ReactNode } from "react";
import { Center, Loader } from "@mantine/core";
import { signOutAction } from "@/app/login/actions";
import { AppFrame } from "@/components/AppFrame";
import { maskPhone } from "@/lib/auth/phone";
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

  return (
    <AppFrame
      chestName={getChestConfig().name}
      signOut={signOutAction}
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
