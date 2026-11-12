import { notFound } from "next/navigation";
import { Badge, Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { deleteArticleAction, restoreRevisionAction } from "@/app/(app)/wiki/actions";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { LinkButton } from "@/components/LinkButton";
import { TextLink } from "@/components/TextLink";
import { changedParts } from "@/lib/wiki/diff";
import { historyPath, revisionPath, viewPath } from "@/lib/wiki/paths";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import {
  getArticle,
  getHistory,
  getRevision,
  linkTargets,
  type ArticleRef,
} from "@/server/wiki/service";
import { ArticleBody } from "./ArticleBody";
import { ArticleEditor } from "./ArticleEditor";
import classes from "./Article.module.css";

const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

const Back = ({ href, children }: { href: string; children: string }) => (
  <LinkButton
    href={href}
    variant="subtle"
    size="compact-sm"
    leftSection={<IconArrowLeft size={14} />}
    ml={-8}
  >
    {children}
  </LinkButton>
);

/** The editor for a person's page or a topic, shared by both sets of addresses. */
export async function EditArticleView({ articleRef }: { articleRef: ArticleRef }) {
  const actor = await requireActor("write");
  const [article, targets] = await Promise.all([getArticle(actor, articleRef), linkTargets(actor)]);
  if (!article) notFound();
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Back href={viewPath(articleRef)}>{article.title}</Back>
          <Title order={1} data-testid="edit-article-title">
            {article.exists ? `Edit: ${article.title}` : `Write about ${article.title}`}
          </Title>
        </div>
        <ArticleEditor
          page={articleRef}
          initial={{ title: article.title, body: article.body }}
          base={article.exists ? article.revisionId : undefined}
          targets={targets}
          cancelHref={viewPath(articleRef)}
        />
        {article.exists && can(actor, "admin") && (
          <div>
            <ConfirmDelete
              action={deleteArticleAction}
              fields={articleRef}
              title="Delete this page?"
              data-testid="delete-article"
            >
              The page and every earlier version of it are removed. This cannot be undone.
            </ConfirmDelete>
          </div>
        )}
      </Stack>
    </Container>
  );
}

/** Every version of a page, newest first. */
export async function HistoryView({ articleRef }: { articleRef: ArticleRef }) {
  const actor = await requireActor("read");
  const [article, history] = await Promise.all([
    getArticle(actor, articleRef),
    getHistory(actor, articleRef),
  ]);
  if (!article || !history) notFound();
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Back href={viewPath(articleRef)}>{article.title}</Back>
          <Title order={1} data-testid="article-history-title">
            History of {article.title}
          </Title>
          <Text c="dimmed">Every saved version. Any of them can be brought back.</Text>
        </div>
        {history.length === 0 ? (
          <Text c="dimmed">Nothing has been written yet.</Text>
        ) : (
          <div data-testid="revision-list">
            {history.map((revision) => (
              <div key={revision.id} className={classes.row} data-testid="revision-row">
                <Group justify="space-between" wrap="nowrap" align="baseline">
                  <div>
                    <TextLink
                      href={revisionPath(articleRef, revision.id)}
                      fw={600}
                      data-testid="revision-link"
                    >
                      {when.format(revision.savedAt)}
                    </TextLink>
                    <Text span c="dimmed">
                      {" "}
                      · {revision.author}
                    </Text>
                    {revision.summary && <Text fz="sm">{revision.summary}</Text>}
                  </div>
                  <Group gap={6} wrap="nowrap">
                    {revision.current && (
                      <Badge variant="light" tt="none" fw={500}>
                        Current
                      </Badge>
                    )}
                    <Text fz="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      +{revision.added} −{revision.removed}
                    </Text>
                  </Group>
                </Group>
              </div>
            ))}
          </div>
        )}
      </Stack>
    </Container>
  );
}

/** One version: what it changed, the page as it stood, and a way to bring it back. */
export async function RevisionView({
  articleRef,
  revisionId,
}: {
  articleRef: ArticleRef;
  revisionId: string;
}) {
  const actor = await requireActor("read");
  const [revision, targets] = await Promise.all([
    getRevision(actor, articleRef, revisionId),
    linkTargets(actor),
  ]);
  if (!revision) notFound();
  const parts = changedParts(revision.changes);
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Back href={historyPath(articleRef)}>History</Back>
          <Title order={1} fz="h2" data-testid="revision-title">
            {revision.title}, as of {when.format(revision.savedAt)}
          </Title>
          <Text c="dimmed">
            Saved by {revision.author}
            {revision.summary ? ` · ${revision.summary}` : ""}
            {revision.current ? " · this is the current version" : ""}
          </Text>
        </div>

        {!revision.current && can(actor, "write") && (
          <form action={restoreRevisionAction}>
            <input type="hidden" name="kind" value={articleRef.kind} />
            <input type="hidden" name="slug" value={articleRef.slug} />
            <input type="hidden" name="revision" value={revision.id} />
            <Button type="submit" variant="default" data-testid="restore-revision">
              Bring this version back
            </Button>
          </form>
        )}

        <Stack gap="xs">
          <Title order={2} fz="h4">
            What this version changed
          </Title>
          <Paper withBorder radius="md" py="xs" data-testid="revision-changes">
            {parts.length === 0 && (
              <Text c="dimmed" px="sm">
                Only the title changed.
              </Text>
            )}
            {parts.map((part, index) =>
              part === null ? (
                <span key={index} className={classes.gap}>
                  ⋯
                </span>
              ) : (
                <span key={index} className={classes[part.kind]} data-kind={part.kind}>
                  {part.text}
                </span>
              ),
            )}
          </Paper>
        </Stack>

        <Stack gap="xs">
          <Title order={2} fz="h4">
            The page as it stood
          </Title>
          <Paper withBorder p="lg" radius="md" bg="var(--hc-surface)">
            <ArticleBody source={revision.body} targets={targets} canCreate={false} />
          </Paper>
        </Stack>
      </Stack>
    </Container>
  );
}
