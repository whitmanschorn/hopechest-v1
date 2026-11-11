import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { EventForm } from "@/components/events/EventForm";
import { BLANK_EVENT } from "@/lib/events/eventEdit";
import { requireActor } from "@/server/auth/session";
import { listPersonOptions } from "@/server/people/service";
import { listPlaceOptions } from "@/server/places/service";

export const metadata: Metadata = { title: "Add an event · Hopechest" };

/** `?person=<slug>` starts with that person taking part; `?place=<slug>` with that place. */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string | string[]; place?: string | string[] }>;
}) {
  const actor = await requireActor("write");
  const query = await searchParams;
  const [people, places] = await Promise.all([listPersonOptions(actor), listPlaceOptions(actor)]);
  const person = people.find((option) => option.value === query.person);
  const place = places.find((option) => option.value === query.place);

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="new-event-title">
            Add an event
          </Title>
          <Text c="dimmed">
            Only a title is needed. Leave the date out if no one knows it, or mark it as a
            deduction.
          </Text>
        </div>
        <EventForm
          initial={{
            ...BLANK_EVENT,
            place: place?.value ?? "",
            participants: person ? [{ person: person.value, role: "subject" }] : [],
          }}
          people={people}
          places={places}
          cancelHref={
            person ? `/people/${person.value}` : place ? `/places/${place.value}` : "/timeline"
          }
        />
      </Stack>
    </Container>
  );
}
