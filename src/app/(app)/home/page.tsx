import type { Metadata } from "next";
import { Container, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { requireActor } from "@/server/auth/session";
import { getChestSummary, type ChestSummary } from "@/server/chest/summary";

export const metadata: Metadata = { title: "Home · Hopechest" };

const COUNTS: { key: keyof ChestSummary; one: string; many: string }[] = [
  { key: "people", one: "person", many: "people" },
  { key: "photos", one: "photo", many: "photos" },
  { key: "events", one: "event", many: "events" },
  { key: "places", one: "place", many: "places" },
  { key: "documents", one: "document", many: "documents" },
];

export default async function HomePage() {
  const actor = await requireActor("read");
  const summary = await getChestSummary(actor);
  const empty = COUNTS.every(({ key }) => summary[key] === 0);
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Stack gap="sm">
          <Title order={1} data-testid="home-title">
            Welcome
          </Title>
          <Text c="dimmed">
            {empty
              ? "Photos, people and stories will appear here as the chest fills up."
              : "What the chest holds so far."}
          </Text>
        </Stack>
        <SimpleGrid cols={{ base: 2, xs: 3, sm: 5 }} data-testid="home-summary">
          {COUNTS.map(({ key, one, many }) => (
            <Paper key={key} p="md" radius="md" withBorder bg="var(--hc-surface)">
              <Text fz={32} fw={600} lh={1.1} data-testid={`home-count-${key}`}>
                {summary[key].toLocaleString("en-US")}
              </Text>
              <Text c="dimmed" fz="sm">
                {summary[key] === 1 ? one : many}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
