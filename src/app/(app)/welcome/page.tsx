import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { getChestConfig } from "@/lib/chest";
import { getDb } from "@/lib/db";
import { toFormInput } from "@/lib/people/personEdit";
import { requireActor } from "@/server/auth/session";
import { getPerson } from "@/server/people/service";
import { WelcomeForm } from "./WelcomeForm";

export const metadata: Metadata = { title: "Welcome · Hopechest" };

/** The first stop after joining: check your name and birthday. */
export default async function WelcomePage() {
  const actor = await requireActor("read");
  const personId = actor.kind === "user" ? actor.personId : null;
  const slug = personId
    ? (await getDb().person.findUnique({ where: { id: personId }, select: { slug: true } }))?.slug
    : null;
  const person = slug ? await getPerson(actor, slug) : null;
  const form = person ? toFormInput(person.values) : null;

  return (
    <Container size={460} py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="welcome-page-title">
            You&apos;re in
          </Title>
          <Text c="dimmed">
            Welcome to the {getChestConfig().name} chest. One quick check so the family tree has you
            right; you can change it any time.
          </Text>
        </div>
        <WelcomeForm initial={{ displayName: form?.displayName ?? "", born: form?.born ?? "" }} />
      </Stack>
    </Container>
  );
}
