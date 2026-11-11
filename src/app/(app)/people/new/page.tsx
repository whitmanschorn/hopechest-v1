import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { PersonForm, type RelativePreset } from "@/components/people/PersonForm";
import type { PersonFormInput } from "@/lib/people/personEdit";
import { requireActor } from "@/server/auth/session";
import { getPerson } from "@/server/people/service";

export const metadata: Metadata = { title: "Add a person · Hopechest" };

const BLANK: PersonFormInput = {
  displayName: "",
  givenName: "",
  familyName: "",
  birthFamilyName: "",
  nicknames: "",
  alternateNames: "",
  gender: "",
  living: "",
  born: "",
  died: "",
  notes: "",
};

/** `?of=<slug>&as=parent|child|partner` starts the form tied to a relative. */
export default async function NewPersonPage({
  searchParams,
}: {
  searchParams: Promise<{ of?: string; as?: string }>;
}) {
  const actor = await requireActor("write");
  const { of, as } = await searchParams;
  const existing = typeof of === "string" ? await getPerson(actor, of) : null;
  // `as` says what the new person is to the existing one; the form asks the reverse.
  const role = as === "parent" ? "child" : as === "child" ? "parent" : "partner";
  const relative: RelativePreset | undefined = existing
    ? { slug: existing.slug, displayName: existing.displayName, role }
    : undefined;

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="new-person-title">
            Add a person
          </Title>
          <Text c="dimmed">
            Only a name is needed. Everything else can be filled in later, by anyone in the family.
          </Text>
        </div>
        <PersonForm
          initial={BLANK}
          relative={relative}
          cancelHref={existing ? `/people/${existing.slug}` : "/people"}
        />
      </Stack>
    </Container>
  );
}
