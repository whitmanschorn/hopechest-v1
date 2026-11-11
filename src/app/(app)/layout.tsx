import { Suspense, type ReactNode } from "react";
import { Center, Loader } from "@mantine/core";
import { requireUser } from "@/server/auth/session";

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
  await requireUser();
  return children;
}
