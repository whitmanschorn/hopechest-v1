import type { Metadata } from "next";
import { Button, Container, Group, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { PersonCard } from "@/components/people/PersonCard";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import { listPeople } from "@/server/people/service";

export const metadata: Metadata = { title: "People · Hopechest" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const actor = await requireActor("read");
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const people = await listPeople(actor, query);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="people-title">
              People
            </Title>
            <Text c="dimmed" data-testid="people-count">
              {query ? `${people.length} matching "${query}"` : `${people.length} in the chest`}
            </Text>
          </div>
          {can(actor, "write") && (
            <LinkButton
              href="/people/new"
              leftSection={<IconPlus size={16} />}
              data-testid="add-person"
            >
              Add a person
            </LinkButton>
          )}
        </Group>

        {/* A plain GET form: the search is a link you can share, and works without scripts. */}
        <form action="/people" role="search">
          <Group gap="sm" align="flex-end">
            <TextInput
              name="q"
              aria-label="Search people by name"
              placeholder="Search by any name or nickname"
              defaultValue={query}
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1, maxWidth: 420 }}
              data-testid="people-search"
            />
            <Button type="submit" variant="default" data-testid="people-search-submit">
              Search
            </Button>
            {query && (
              <LinkButton href="/people" variant="subtle">
                Show everyone
              </LinkButton>
            )}
          </Group>
        </form>

        {people.length === 0 ? (
          <Text c="dimmed" data-testid="people-empty">
            {query ? "No one by that name." : "No one has been added yet."}
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} data-testid="people-list">
            {people.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
