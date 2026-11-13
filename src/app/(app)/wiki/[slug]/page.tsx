import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconHistory, IconPencil, IconTopologyStar3 } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { FactsPanel } from "@/components/graph/FactsPanel";
import { KindPicker } from "@/components/graph/KindPicker";
import { ArticleBody } from "@/components/wiki/ArticleBody";
import { KIND_LABELS } from "@/lib/graph/vocabulary";
import { editPath, historyPath } from "@/lib/wiki/paths";
import { requireActor } from "@/server/auth/session";
import { getNode } from "@/server/graph/service";
import { getArticle, linkTargets } from "@/server/wiki/service";

export const metadata: Metadata = { title: "Wiki · Hopechest" };

const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActor("read");
  const ref = { kind: "topic" as const, slug: (await params).slug };
  const [article, targets] = await Promise.all([getArticle(actor, ref), linkTargets(actor)]);
  if (!article) notFound();
  const nodeKey = `page:${ref.slug}`;
  const node = await getNode(actor, nodeKey);
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <LinkButton
            href="/wiki"
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
          >
            Wiki
          </LinkButton>
          <Group gap="xs">
            <LinkButton
              href={historyPath(ref)}
              variant="default"
              size="compact-sm"
              leftSection={<IconHistory size={14} />}
              data-testid="article-history"
            >
              History
            </LinkButton>
            {article.canEdit && (
              <LinkButton
                href={editPath(ref)}
                variant="default"
                size="compact-sm"
                leftSection={<IconPencil size={14} />}
                data-testid="edit-article"
              >
                Edit
              </LinkButton>
            )}
          </Group>
        </Group>
        <div>
          <Title order={1} data-testid="article-title">
            {article.title}
          </Title>
          <Group gap="xs" mt={4}>
            {article.canEdit ? (
              <KindPicker nodeKey={nodeKey} kind={node?.kind ?? "topic"} />
            ) : (
              <Badge variant="light" tt="none" fw={500} data-testid="page-kind">
                {KIND_LABELS[node?.kind ?? "topic"]}
              </Badge>
            )}
          </Group>
          {article.updatedAt && (
            <Text c="dimmed" fz="sm" data-testid="article-updated">
              Last edited {day.format(article.updatedAt)} by {article.updatedBy}
            </Text>
          )}
        </div>
        <Stack gap="sm" component="section" data-testid="node-facts">
          <Group justify="space-between" align="flex-end">
            <Title order={2} fz="h3">
              Facts
            </Title>
            <LinkButton
              href={`/graph?center=${encodeURIComponent(nodeKey)}`}
              variant="subtle"
              size="compact-sm"
              leftSection={<IconTopologyStar3 size={14} />}
              data-testid="see-in-graph"
            >
              See in the graph
            </LinkButton>
          </Group>
          <FactsPanel actor={actor} nodeKey={nodeKey} core />
        </Stack>

        {article.body.trim() ? (
          <Paper p="lg" radius="md" withBorder bg="var(--hc-surface)">
            <ArticleBody source={article.body} targets={targets} canCreate={article.canEdit} />
          </Paper>
        ) : (
          <Text c="dimmed" data-testid="article-empty">
            Nothing has been written here yet.
          </Text>
        )}
      </Stack>
    </Container>
  );
}
