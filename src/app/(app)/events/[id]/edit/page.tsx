import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Stack, Title } from "@mantine/core";
import { EventForm } from "@/components/events/EventForm";
import { toEventFormInput } from "@/lib/events/eventEdit";
import { requireActor } from "@/server/auth/session";
import { eventValues, getEvent } from "@/server/events/service";
import { listPersonOptions } from "@/server/people/service";
import { listPlaceOptions } from "@/server/places/service";

export const metadata: Metadata = { title: "Edit event · Hopechest" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("write");
  const { id } = await params;
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const [people, places] = await Promise.all([listPersonOptions(actor), listPlaceOptions(actor)]);

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} data-testid="edit-event-title">
          Edit {event.title}
        </Title>
        <EventForm
          initial={toEventFormInput(eventValues(event))}
          id={event.id}
          people={people}
          places={places}
          cancelHref={`/events/${event.id}`}
        />
      </Stack>
    </Container>
  );
}
