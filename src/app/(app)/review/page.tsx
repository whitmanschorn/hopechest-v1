import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Code, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { countLabels, sourceLabel } from "@/lib/ingest/labels";
import { requireActor } from "@/server/auth/session";
import { listClaims } from "@/server/claims/service";
import { countWaitingFaces } from "@/server/faces/service";
import { listBatches } from "@/server/ingest/service";
import classes from "@/components/review/ReviewBoard.module.css";

export const metadata: Metadata = { title: "Review · Hopechest" };

const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function ReviewPage() {
  const actor = await requireActor("write");
  const [batches, { waiting }, faces] = await Promise.all([
    listBatches(actor),
    listClaims(actor),
    countWaitingFaces(actor),
  ]);
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="review-title">
            Review
          </Title>
          <Text c="dimmed">
            Photos and documents brought in by the boxful wait here. The family sees them once you
            publish them.
          </Text>
        </div>

        <ReviewTabs current="arrivals" waitingFacts={waiting} waitingFaces={faces} />

        {batches.length === 0 ? (
          <Paper withBorder p="lg" data-testid="review-empty">
            <Stack gap="xs">
              <Text fw={600}>Nothing has been brought in yet.</Text>
              <Text c="dimmed">
                A folder of scans comes in from a terminal with{" "}
                <Code>hopechest ingest &lt;folder&gt;</Code>. Each run shows up here as a batch.
              </Text>
            </Stack>
          </Paper>
        ) : (
          <Stack gap="sm" data-testid="batch-list">
            {batches.map((batch) => (
              <Link
                key={batch.id}
                href={`/review/${batch.id}`}
                className={classes.batch}
                data-testid="batch-card"
                data-waiting={batch.counts.waiting}
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text fw={600}>{batch.label}</Text>
                    <Text c="dimmed" fz="sm">
                      {sourceLabel(batch.source)} · {day.format(batch.startedAt)}
                      {batch.startedBy ? ` · ${batch.startedBy}` : ""}
                      {batch.open ? " · still arriving" : ""}
                    </Text>
                  </div>
                  <Group gap={6} justify="flex-end">
                    {countLabels(batch.counts).map(({ key, label }) => (
                      <Badge
                        key={key}
                        variant={key === "waiting" ? "filled" : "light"}
                        color={key === "failed" ? "red" : key === "waiting" ? undefined : "gray"}
                        tt="none"
                        fw={500}
                      >
                        {label}
                      </Badge>
                    ))}
                  </Group>
                </Group>
              </Link>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
