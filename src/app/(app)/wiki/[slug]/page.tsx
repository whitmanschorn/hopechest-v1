import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconHistory, IconPencil } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { ArticleBody } from "@/components/wiki/ArticleBody";
import { editPath, historyPath } from "@/lib/wiki/paths";
import { requireActor } from "@/server/auth/session";
import { getArticle, linkTargets } from "@/server/wiki/service";

export const metadata: Metadata = { title: "Wiki · Hopechest" };

const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActor("read");
  const ref = { kind: "topic" as const, slug: (await params).slug };
  const [article, targets] = await Promise.all([getArticle(actor, ref), linkTargets(actor)]);
  if (!article) notFound();
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
          {article.updatedAt && (
            <Text c="dimmed" fz="sm" data-testid="article-updated">
              Last edited {day.format(article.updatedAt)} by {article.updatedBy}
            </Text>
          )}
        </div>
        <Paper p="lg" radius="md" withBorder bg="var(--hc-surface)">
          <ArticleBody source={article.body} targets={targets} canCreate={article.canEdit} />
        </Paper>
      </Stack>
    </Container>
  );
}
