import type { Metadata } from "next";
import { Button, Container, Group, NativeSelect, Stack, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { EventCard } from "@/components/events/EventCard";
import { LinkButton } from "@/components/LinkButton";
import { EVENT_KINDS, isEventKind, KIND_LABELS } from "@/lib/events/eventEdit";
import { groupByDecade } from "@/lib/events/timeline";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import { listEvents } from "@/server/events/service";
import { listPersonOptions } from "@/server/people/service";

export const metadata: Metadata = { title: "Timeline · Hopechest" };

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** `?kind=marriage&person=<slug>` narrows the timeline. */
export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[]; person?: string | string[] }>;
}) {
  const actor = await requireActor("read");
  const query = await searchParams;
  const people = await listPersonOptions(actor);
  // A filter that names nothing real is dropped rather than showing an empty page.
  const kind = isEventKind(first(query.kind)) ? first(query.kind) : "";
  const person = people.some((option) => option.value === first(query.person))
    ? first(query.person)
    : "";
  const events = await listEvents(actor, { kind, person });
  const decades = groupByDecade(events);
  const filtered = Boolean(kind || person);

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="timeline-title">
              Timeline
            </Title>
            <Text c="dimmed" data-testid="timeline-count">
              {events.length} {events.length === 1 ? "event" : "events"}
              {filtered ? " matching" : " in the chest"}
            </Text>
          </div>
          {can(actor, "write") && (
            <LinkButton
              href={person ? `/events/new?person=${person}` : "/events/new"}
              leftSection={<IconPlus size={16} />}
              data-testid="add-event"
            >
              Add an event
            </LinkButton>
          )}
        </Group>

        {/* A plain GET form: a filtered timeline is a link you can share. */}
        <form action="/timeline" data-testid="timeline-filter">
          <Group gap="sm" align="flex-end">
            <NativeSelect
              name="kind"
              label="Kind"
              data={[
                { value: "", label: "Every kind" },
                ...EVENT_KINDS.map((value) => ({ value, label: KIND_LABELS[value] })),
              ]}
              defaultValue={kind}
              data-testid="filter-kind"
            />
            <NativeSelect
              name="person"
              label="Person"
              data={[{ value: "", label: "Everyone" }, ...people]}
              defaultValue={person}
              data-testid="filter-person"
            />
            <Button type="submit" variant="default" data-testid="filter-submit">
              Show
            </Button>
            {filtered && (
              <LinkButton href="/timeline" variant="subtle" data-testid="filter-clear">
                Show everything
              </LinkButton>
            )}
          </Group>
        </form>

        {decades.length === 0 && (
          <Text c="dimmed" data-testid="timeline-empty">
            {filtered ? "No events match." : "No events have been added yet."}
          </Text>
        )}
        {decades.map((decade) => (
          <Stack key={decade.id} gap="sm" component="section" data-testid={`decade-${decade.id}`}>
            <Title order={2} fz="h3">
              {decade.label}
            </Title>
            {decade.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </Stack>
        ))}
      </Stack>
    </Container>
  );
}
