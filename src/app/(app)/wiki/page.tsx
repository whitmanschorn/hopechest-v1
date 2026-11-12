import type { Metadata } from "next";
import { Container, Group, Stack, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { TextLink } from "@/components/TextLink";
import { viewPath } from "@/lib/wiki/paths";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import { listArticles, type ArticleCard } from "@/server/wiki/service";
import classes from "@/components/wiki/Article.module.css";

export const metadata: Metadata = { title: "Wiki · Hopechest" };

function Pages({ cards, testId }: { cards: ArticleCard[]; testId: string }) {
  return (
    <div data-testid={testId}>
      {cards.map((card) => (
        <div
          key={`${card.ref.kind}:${card.ref.slug}`}
          className={classes.row}
          data-testid="wiki-row"
        >
          <TextLink href={viewPath(card.ref)} fw={600} data-testid="wiki-row-link">
            {card.title}
          </TextLink>
          {card.opening && (
            <Text fz="sm" c="dimmed" lineClamp={2}>
              {card.opening}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function WikiPage() {
  const actor = await requireActor("read");
  const { topics, people } = await listArticles(actor);
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="wiki-title">
              Wiki
            </Title>
            <Text c="dimmed">
              The family’s stories, written together. Anyone who can add things can edit any page.
            </Text>
          </div>
          {can(actor, "write") && (
            <LinkButton
              href="/wiki/new"
              leftSection={<IconPlus size={16} />}
              data-testid="new-article"
            >
              New page
            </LinkButton>
          )}
        </Group>

        <Stack gap="xs">
          <Title order={2} fz="h3">
            Topics
          </Title>
          {topics.length === 0 ? (
            <Text c="dimmed" data-testid="wiki-no-topics">
              No topic pages yet. A topic can be anything: a house, a business, a tradition, a trip.
            </Text>
          ) : (
            <Pages cards={topics} testId="wiki-topics" />
          )}
        </Stack>

        <Stack gap="xs">
          <Title order={2} fz="h3">
            People
          </Title>
          {people.length === 0 ? (
            <Text c="dimmed">
              Nobody has been written about yet. Open someone under People and choose “Write about
              them”.
            </Text>
          ) : (
            <Pages cards={people} testId="wiki-people" />
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
