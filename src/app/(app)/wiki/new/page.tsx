import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { ArticleEditor } from "@/components/wiki/ArticleEditor";
import { requireActor } from "@/server/auth/session";
import { linkTargets } from "@/server/wiki/service";

export const metadata: Metadata = { title: "New page · Hopechest" };

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  const actor = await requireActor("write");
  const title = ((await searchParams).title ?? "").slice(0, 120);
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="new-article-title">
            New page
          </Title>
          <Text c="dimmed">
            For a person, open them under People instead: their page is part of their profile.
          </Text>
        </div>
        <ArticleEditor
          page={null}
          initial={{ title, body: "" }}
          targets={await linkTargets(actor)}
          cancelHref="/wiki"
        />
      </Stack>
    </Container>
  );
}
