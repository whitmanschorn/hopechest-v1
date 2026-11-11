import { Badge, Group, Paper, Text } from "@mantine/core";
import { TextLink } from "@/components/TextLink";
import { KIND_LABELS, ROLE_LABELS } from "@/lib/events/eventEdit";
import { describe } from "@/lib/fuzzyDate";
import type { EventView } from "@/server/events/service";

/** One event on the timeline or a place page. */
export function EventCard({ event, hidePlace }: { event: EventView; hidePlace?: boolean }) {
  return (
    <Paper p="md" radius="md" withBorder bg="var(--hc-surface)" data-testid="event-card">
      <Group justify="space-between" gap="xs" align="baseline">
        <Group gap="xs" align="baseline">
          <TextLink href={`/events/${event.id}`} fw={600} c="inherit" data-testid="event-link">
            {event.title}
          </TextLink>
          <Badge variant="light" size="sm" tt="none" fw={500} data-testid="event-kind">
            {KIND_LABELS[event.kind]}
          </Badge>
        </Group>
        <Text c="dimmed" fz="sm" data-testid="event-date">
          {event.date ? describe(event.date) : "Date not recorded"}
          {event.place && !hidePlace && (
            <>
              {" · "}
              <TextLink href={`/places/${event.place.slug}`} inherit>
                {event.place.label}
              </TextLink>
            </>
          )}
        </Text>
      </Group>
      {event.description && (
        <Text fz="sm" mt={4} style={{ whiteSpace: "pre-wrap" }}>
          {event.description}
        </Text>
      )}
      {event.date?.deduced && event.date.clue && (
        <Text fz="sm" c="dimmed" mt={4} data-testid="event-clue">
          Date deduced: {event.date.clue}
        </Text>
      )}
      {event.participants.length > 0 && (
        <Text fz="sm" c="dimmed" mt={4} data-testid="event-people">
          {event.participants.map((person, index) => (
            <span key={person.slug}>
              {index > 0 && ", "}
              <TextLink href={`/people/${person.slug}`} inherit>
                {person.displayName}
              </TextLink>
              {person.role !== "subject" && ` (${ROLE_LABELS[person.role].toLowerCase()})`}
            </span>
          ))}
        </Text>
      )}
    </Paper>
  );
}
