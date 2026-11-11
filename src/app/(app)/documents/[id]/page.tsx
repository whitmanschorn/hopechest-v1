import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Anchor, Badge, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { describe } from "@/lib/fuzzyDate";
import { requireActor } from "@/server/auth/session";
import { getDocument } from "@/server/documents/service";

export const metadata: Metadata = { title: "Document · Hopechest" };

const KINDS: Record<string, string> = {
  record: "Record",
  letter: "Letter",
  recipe: "Recipe",
  story: "Story",
  article: "Article",
  other: "Document",
};

/** A document's text. Uploading and searching documents come with the documents feature. */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("read");
  const doc = await getDocument(actor, (await params).id);
  if (!doc) notFound();

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="document-title">
            {doc.title}
          </Title>
          <Group gap="xs" mt={4}>
            <Badge variant="light" tt="none" fw={500} size="lg" data-testid="document-kind">
              {KINDS[doc.kind] ?? "Document"}
            </Badge>
            <Text c="dimmed" data-testid="document-date">
              {doc.date ? describe(doc.date) : "Date not recorded"}
            </Text>
          </Group>
        </div>
        <Paper p="lg" radius="md" withBorder bg="var(--hc-surface)">
          <Text
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            data-testid="document-text"
          >
            {doc.text ?? "The text of this document has not been read yet."}
          </Text>
        </Paper>
        {(doc.originalUrl || (doc.citation && doc.citation !== doc.title)) && (
          <Text c="dimmed" fz="sm" data-testid="document-origin">
            {doc.citation && doc.citation !== doc.title && `${doc.citation}. `}
            {doc.originalUrl && (
              <Anchor href={doc.originalUrl} target="_blank" rel="noreferrer" inherit>
                Where it came from
              </Anchor>
            )}
          </Text>
        )}
      </Stack>
    </Container>
  );
}
