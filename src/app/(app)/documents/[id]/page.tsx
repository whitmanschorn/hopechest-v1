import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Anchor, Badge, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconDownload, IconPencil } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { KIND_LABELS } from "@/lib/documents/kinds";
import { describe } from "@/lib/fuzzyDate";
import { requireActor } from "@/server/auth/session";
import { getDocument } from "@/server/documents/service";
import classes from "@/components/photos/PhotoGrid.module.css";

export const metadata: Metadata = { title: "Document · Hopechest" };

/** One document: its original, if the chest holds it, and what it says. */
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ already?: string }>;
}) {
  const actor = await requireActor("read");
  const doc = await getDocument(actor, (await params).id);
  if (!doc) notFound();

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <LinkButton
            href="/documents"
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
          >
            Documents
          </LinkButton>
          <Group gap="xs">
            {doc.fileUrl && (
              <LinkButton
                href={doc.fileUrl}
                variant="default"
                size="compact-sm"
                leftSection={<IconDownload size={14} />}
                data-testid="document-file"
              >
                Original file
              </LinkButton>
            )}
            {doc.canEdit && (
              <LinkButton
                href={`/documents/${doc.id}/edit`}
                variant="default"
                size="compact-sm"
                leftSection={<IconPencil size={14} />}
                data-testid="edit-document"
              >
                Edit
              </LinkButton>
            )}
          </Group>
        </Group>
        {(await searchParams).already && (
          <Alert color="yellow" data-testid="document-already">
            This document was already in the chest, so nothing new was added.
          </Alert>
        )}
        <div>
          <Title order={1} data-testid="document-title">
            {doc.title}
          </Title>
          <Group gap="xs" mt={4}>
            <Badge variant="light" tt="none" fw={500} size="lg" data-testid="document-kind">
              {KIND_LABELS[doc.kind] ?? "Document"}
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
              <Text c="dimmed" data-testid="document-no-text">
                Nobody has typed out what this says yet.
                {doc.canEdit ? " Choose Edit to add it." : ""}
              </Text>
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
