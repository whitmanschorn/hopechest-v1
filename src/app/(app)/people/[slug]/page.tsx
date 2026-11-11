import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconCalendarPlus, IconHistory, IconPencil } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { TextLink } from "@/components/TextLink";
import { AddRelative } from "@/components/people/AddRelative";
import { PersonAvatar, PersonCard } from "@/components/people/PersonCard";
import { RemoveRelationship } from "@/components/people/RemoveRelationship";
import { describe } from "@/lib/fuzzyDate";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import {
  getPerson,
  listPersonOptions,
  type PersonRef,
  type Relative,
} from "@/server/people/service";

export const metadata: Metadata = { title: "Person · Hopechest" };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text c="dimmed" fz="xs" tt="uppercase" fw={600} lts={0.4}>
        {label}
      </Text>
      <Text>{children}</Text>
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="sm" component="section" data-testid={testId}>
      <Title order={2} fz="h3">
        {title}
      </Title>
      {children}
    </Stack>
  );
}

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActor("read");
  const { slug } = await params;
  const person = await getPerson(actor, slug);
  if (!person) notFound();
  const canWrite = can(actor, "write");
  const options = canWrite
    ? (await listPersonOptions(actor)).filter((option) => option.value !== person.slug)
    : [];
  const { values } = person;

  const facts: [string, string | null][] = [
    ["Born", values.born ? describe(values.born) : null],
    ["Died", values.died ? describe(values.died) : null],
    ["Given name", values.givenName],
    ["Family name", values.familyName],
    ["Family name at birth", values.birthFamilyName],
    ["Nicknames", values.nicknames.join(", ") || null],
    ["Also known as", values.alternateNames.join(", ") || null],
  ];
  const shown = facts.filter((fact): fact is [string, string] => fact[1] !== null);

  const group = (title: string, role: string, list: (Relative | PersonRef)[]) =>
    list.length > 0 && (
      <div data-testid={`family-${role}`}>
        <Text c="dimmed" fz="xs" tt="uppercase" fw={600} lts={0.4} mb={6}>
          {title}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {list.map((relative) => {
            const link = "relationshipId" in relative ? relative : null;
            const detail = link ? [link.qualifier, link.ended].filter(Boolean).join(", ") : "";
            return (
              <Group key={link?.relationshipId ?? relative.id} gap={4} wrap="nowrap" align="center">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <PersonCard
                    person={relative}
                    detail={detail || undefined}
                    testId={`relative-${relative.slug}`}
                  />
                </div>
                {canWrite && link && (
                  <RemoveRelationship
                    relationshipId={link.relationshipId}
                    slug={person.slug}
                    description={`the link between ${relative.displayName} and ${person.displayName}`}
                  />
                )}
              </Group>
            );
          })}
        </SimpleGrid>
      </div>
    );

  const hasFamily =
    person.parents.length +
      person.partners.length +
      person.children.length +
      person.siblings.length >
    0;

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" gap="md">
          <Group gap="md" wrap="nowrap" align="center">
            <PersonAvatar person={person} size={84} />
            <div>
              <Title order={1} data-testid="person-name">
                {person.displayName}
              </Title>
              <Group gap="xs" mt={4}>
                {person.lifespan && (
                  <Text c="dimmed" data-testid="person-lifespan">
                    {person.lifespan}
                  </Text>
                )}
                {(person.isYou || person.kin) && (
                  <Badge variant="light" tt="none" fw={500} size="lg" data-testid="person-kin">
                    {person.isYou ? "This is you" : `Your ${person.kin}`}
                  </Badge>
                )}
              </Group>
            </div>
          </Group>
          <Group gap="xs">
            {canWrite && (
              <LinkButton
                href={`/people/${person.slug}/edit`}
                variant="default"
                leftSection={<IconPencil size={16} />}
                data-testid="edit-person"
              >
                Edit
              </LinkButton>
            )}
            <LinkButton
              href={`/people/${person.slug}/history`}
              variant="default"
              leftSection={<IconHistory size={16} />}
              data-testid="person-history"
            >
              History
            </LinkButton>
          </Group>
        </Group>

        {(shown.length > 0 || values.notes) && (
          <Section title="About" testId="person-about">
            <Paper p="md" radius="md" withBorder bg="var(--hc-surface)">
              <Stack gap="md">
                {shown.length > 0 && (
                  <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} verticalSpacing="md">
                    {shown.map(([label, value]) => (
                      <Fact key={label} label={label}>
                        {value}
                      </Fact>
                    ))}
                  </SimpleGrid>
                )}
                {values.notes && (
                  <Text style={{ whiteSpace: "pre-wrap" }} data-testid="person-notes">
                    {values.notes}
                  </Text>
                )}
              </Stack>
            </Paper>
          </Section>
        )}

        <Section title="Family" testId="person-family">
          {!hasFamily && <Text c="dimmed">No relatives recorded yet.</Text>}
          {group("Parents", "parents", person.parents)}
          {group("Partners", "partners", person.partners)}
          {group("Children", "children", person.children)}
          {group("Brothers and sisters", "siblings", person.siblings)}
          {canWrite && (
            <div>
              <AddRelative slug={person.slug} displayName={person.displayName} options={options} />
            </div>
          )}
        </Section>

        {(person.events.length > 0 || canWrite) && (
          <Section title="Life events" testId="person-events">
            {person.events.length === 0 && <Text c="dimmed">No events recorded yet.</Text>}
            <Stack gap="sm">
              {person.events.map((event) => (
                <Paper
                  key={event.id}
                  p="md"
                  radius="md"
                  withBorder
                  bg="var(--hc-surface)"
                  data-testid="person-event"
                >
                  <Group justify="space-between" gap="xs" align="baseline">
                    <TextLink
                      href={`/events/${event.id}`}
                      fw={600}
                      c="inherit"
                      data-testid="person-event-link"
                    >
                      {event.title}
                    </TextLink>
                    <Text c="dimmed" fz="sm">
                      {[event.date ? describe(event.date) : "Date not recorded", event.place]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Group>
                  {event.description && <Text fz="sm">{event.description}</Text>}
                  {event.date?.deduced && event.date.clue && (
                    <Text fz="sm" c="dimmed" mt={4}>
                      Date deduced: {event.date.clue}
                    </Text>
                  )}
                  {event.with.length > 0 && (
                    <Text fz="sm" c="dimmed" mt={4}>
                      With{" "}
                      {event.with.map((other, index) => (
                        <span key={other.slug}>
                          {index > 0 && ", "}
                          <TextLink href={`/people/${other.slug}`} inherit>
                            {other.displayName}
                          </TextLink>
                        </span>
                      ))}
                    </Text>
                  )}
                </Paper>
              ))}
            </Stack>
            {canWrite && (
              <div>
                <LinkButton
                  href={`/events/new?person=${person.slug}`}
                  variant="default"
                  leftSection={<IconCalendarPlus size={16} />}
                  data-testid="add-event"
                >
                  Add an event
                </LinkButton>
              </div>
            )}
          </Section>
        )}
      </Stack>
    </Container>
  );
}
