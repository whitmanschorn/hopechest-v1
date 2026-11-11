import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { requireActor } from "@/server/auth/session";
import { getPersonHistory } from "@/server/people/service";

export const metadata: Metadata = { title: "History · Hopechest" };

const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function PersonHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActor("read");
  const { slug } = await params;
  const history = await getPersonHistory(actor, slug);
  if (!history) notFound();
  const { person, entries } = history;

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <LinkButton
            href={`/people/${person.slug}`}
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
          >
            {person.displayName}
          </LinkButton>
          <Title order={1} data-testid="history-title">
            History
          </Title>
          <Text c="dimmed">Every change to this person&apos;s record, newest first.</Text>
        </div>

        {entries.length === 0 ? (
          <Text c="dimmed" data-testid="history-empty">
            Nothing has been changed since this person was added.
          </Text>
        ) : (
          <Stack gap="sm" data-testid="history-list">
            {entries.map((entry) => (
              <Paper
                key={entry.id}
                p="md"
                radius="md"
                withBorder
                bg="var(--hc-surface)"
                data-testid="history-entry"
              >
                <Group justify="space-between" gap="xs">
                  <Text fw={600}>{entry.what}</Text>
                  <Text c="dimmed" fz="sm">
                    {entry.by} · {DAY.format(entry.at)}
                  </Text>
                </Group>
                {entry.before !== null && (
                  <Text fz="sm" c="dimmed" td="line-through" style={{ overflowWrap: "anywhere" }}>
                    {entry.before}
                  </Text>
                )}
                {entry.after !== null && (
                  <Text fz="sm" style={{ overflowWrap: "anywhere" }}>
                    {entry.after}
                  </Text>
                )}
                {entry.after === null && entry.before !== null && (
                  <Text fz="sm" c="dimmed">
                    Removed
                  </Text>
                )}
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
