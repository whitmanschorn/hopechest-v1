import type { Metadata } from "next";
import { Badge, Button, Container, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { TextLink } from "@/components/TextLink";
import { DOCUMENT_KINDS, isKind, KIND_LABELS, splitExcerpt } from "@/lib/documents/kinds";
import { describe } from "@/lib/fuzzyDate";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import { listDocuments } from "@/server/documents/service";
import classes from "@/components/documents/Documents.module.css";

export const metadata: Metadata = { title: "Documents · Hopechest" };

const PLURALS: Record<string, string> = {
  letter: "Letters",
  record: "Records",
  recipe: "Recipes",
  story: "Stories",
  article: "Articles",
  other: "Other",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const actor = await requireActor("read");
  const query = await searchParams;
  const q = (query.q ?? "").trim();
  const kind = query.kind && isKind(query.kind) ? query.kind : "";
  const { documents, total } = await listDocuments(actor, { q, kind });
  const address = (next: string) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(next ? { kind: next } : {}) });
    return params.size > 0 ? `/documents?${params}` : "/documents";
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="documents-title">
              Documents
            </Title>
            <Text c="dimmed">
              Letters, records, recipes and stories, searchable by their words.
            </Text>
          </div>
          {can(actor, "write") && (
            <LinkButton
              href="/documents/new"
              leftSection={<IconPlus size={16} />}
              data-testid="new-document"
            >
              Add a document
            </LinkButton>
          )}
        </Group>

        <form action="/documents" method="get" role="search">
          {kind && <input type="hidden" name="kind" value={kind} />}
          <Group gap="sm" align="flex-end">
            <TextInput
              name="q"
              aria-label="Search the documents"
              placeholder="Search every document’s words"
              defaultValue={q}
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1 }}
              data-testid="document-search"
            />
            <Button type="submit" variant="default" data-testid="document-search-go">
              Search
            </Button>
          </Group>
        </form>

        <Group gap={6} data-testid="document-kinds">
          {["", ...DOCUMENT_KINDS].map((entry) => (
            <LinkButton
              key={entry || "all"}
              href={address(entry)}
              size="compact-sm"
              variant={entry === kind ? "filled" : "default"}
              data-testid={`document-kind-${entry || "all"}`}
            >
              {entry ? PLURALS[entry] : "All"}
            </LinkButton>
          ))}
        </Group>

        <Text c="dimmed" fz="sm" data-testid="documents-count">
          {q
            ? `${total === 1 ? "1 document mentions" : `${total} documents mention`} “${q}”`
            : total === 1
              ? "1 document"
              : `${total} documents`}
          {documents.length < total ? `, showing the first ${documents.length}` : ""}
        </Text>

        <Stack gap={0} data-testid="document-list">
          {documents.map((doc) => (
            <div key={doc.id} className={classes.row} data-testid="document-row">
              <Group justify="space-between" align="baseline" wrap="nowrap" gap="sm">
                <TextLink href={`/documents/${doc.id}`} fw={600} data-testid="document-link">
                  {doc.title}
                </TextLink>
                <Group gap={8} wrap="nowrap">
                  <Text c="dimmed" fz="sm" style={{ whiteSpace: "nowrap" }}>
                    {doc.date ? describe(doc.date) : ""}
                  </Text>
                  <Badge variant="light" tt="none" fw={500}>
                    {KIND_LABELS[doc.kind] ?? "Document"}
                  </Badge>
                </Group>
              </Group>
              {doc.excerpt && (
                <Text fz="sm" mt={4} data-testid="document-excerpt">
                  {splitExcerpt(doc.excerpt).map((piece, index) =>
                    piece.hit ? (
                      <mark key={index} className={classes.hit}>
                        {piece.text}
                      </mark>
                    ) : (
                      <span key={index}>{piece.text}</span>
                    ),
                  )}
                </Text>
              )}
              {!doc.hasText && (
                <Text fz="sm" c="dimmed" mt={4}>
                  Not typed out yet, so its words cannot be searched.
                </Text>
              )}
            </div>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
