import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Anchor, Badge, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { describe } from "@/lib/fuzzyDate";
import { requireActor } from "@/server/auth/session";
import { getDocument } from "@/server/documents/service";
import classes from "@/components/photos/PhotoGrid.module.css";

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
        {doc.scanUrl && (
          <Stack gap={6}>
            <a
              href={doc.scanUrl}
              target="_blank"
              rel="noreferrer"
              className={classes.frame}
              data-testid="document-scan-link"
            >
              {/* Served by /api/files behind the session, so next/image's optimizer cannot fetch it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc.scanUrl}
                alt={`The original: ${doc.title}`}
                data-testid="document-scan"
              />
            </a>
            <Text c="dimmed" fz="sm">
              The original. Select it to open it full size.
            </Text>
          </Stack>
        )}
        {doc.scanUrl && (
          <Title order={2} fz="h3">
            What it says
          </Title>
        )}
        <Paper p="lg" radius="md" withBorder bg="var(--hc-surface)">
          <Stack gap="sm" data-testid="document-text" style={{ overflowWrap: "anywhere" }}>
            {doc.text === null && (
              <Text c="dimmed">The text of this document has not been read yet.</Text>
            )}
            {(doc.text ?? "")
              .split(/\n{2,}/)
              .filter((block) => block.trim())
              .map((block, index) => {
                // Section headings in the stored text are marked "## ".
                const heading = /^#{1,6} +(.*)$/.exec(block.trim());
                return heading ? (
                  <Text key={index} fw={700} mt="xs">
                    {heading[1]}
                  </Text>
                ) : (
                  <Text key={index} style={{ whiteSpace: "pre-wrap" }}>
                    {block}
                  </Text>
                );
              })}
          </Stack>
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
