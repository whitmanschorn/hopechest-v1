import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Container, List, ListItem, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { photoLabel } from "@/components/photos/PhotoGrid";
import { ReviewBoard } from "@/components/review/ReviewBoard";
import { describe } from "@/lib/fuzzyDate";
import { countLabels, sourceLabel } from "@/lib/ingest/labels";
import { requireActor } from "@/server/auth/session";
import { getBatch } from "@/server/ingest/service";

export const metadata: Metadata = { title: "Review a batch · Hopechest" };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("write");
  const batch = await getBatch(actor, (await params).id);
  if (!batch) notFound();
  const summary = countLabels(batch.counts)
    .map(({ label }) => label)
    .join(" · ");

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <LinkButton
            href="/review"
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
          >
            Review
          </LinkButton>
          <Title order={1} data-testid="batch-title">
            {batch.label}
          </Title>
          <Text c="dimmed" data-testid="batch-summary">
            {sourceLabel(batch.source)}
            {batch.startedBy ? ` · brought in by ${batch.startedBy}` : ""}
            {summary ? ` · ${summary}` : ""}
            {batch.open ? " · more may still be arriving" : ""}
          </Text>
        </div>

        {batch.failed.length > 0 && (
          <Alert color="red" title="Some files could not be read" data-testid="batch-failed">
            <List size="sm">
              {batch.failed.map((item, index) => (
                <ListItem key={index}>
                  {item.filename ?? "A file"}: {item.error}
                </ListItem>
              ))}
            </List>
          </Alert>
        )}

        <ReviewBoard
          batchId={batch.id}
          photos={batch.waiting.map((photo) => ({
            id: photo.id,
            thumbUrl: photo.thumbUrl,
            alt: photoLabel(photo),
            filename: photo.filename,
            caption: photo.caption,
            date: photo.date ? describe(photo.date) : null,
            people: photo.people.map((person) => person.displayName),
            problems: photo.problems,
          }))}
        />
      </Stack>
    </Container>
  );
}
