import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Stack, Title } from "@mantine/core";
import { PersonForm } from "@/components/people/PersonForm";
import { toFormInput } from "@/lib/people/personEdit";
import { requireActor } from "@/server/auth/session";
import { getPerson } from "@/server/people/service";

export const metadata: Metadata = { title: "Edit · Hopechest" };

export default async function EditPersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActor("write");
  const { slug } = await params;
  const person = await getPerson(actor, slug);
  if (!person) notFound();

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} data-testid="edit-person-title">
          Edit {person.displayName}
        </Title>
        <PersonForm
          initial={toFormInput(person.values)}
          slug={person.slug}
          cancelHref={`/people/${person.slug}`}
        />
      </Stack>
    </Container>
  );
}
