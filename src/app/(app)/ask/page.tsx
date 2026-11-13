import type { Metadata } from "next";
import { Container, Paper, Stack, Text, Title } from "@mantine/core";
import { AskThread } from "@/components/ask/AskThread";
import { TextLink } from "@/components/TextLink";
import { askModel, listConversations } from "@/server/ask/service";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Ask · Hopechest" };

const EXAMPLES = [
  "When were my grandparents married?",
  "Who are my cousins?",
  "Where was my mother born?",
];
const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function AskPage() {
  const actor = await requireActor("read");
  const earlier = await listConversations(actor);
  const model = askModel();
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="ask-title">
            Ask
          </Title>
          <Text c="dimmed">
            Ask about the family in your own words. Answers come only from what the chest holds, and
            say where each fact came from. If something is not recorded, the answer says so.
          </Text>
        </div>

        {model ? (
          <AskThread conversationId={null} turns={[]} examples={EXAMPLES} />
        ) : (
          <Paper withBorder p="lg" data-testid="ask-unavailable">
            <Text c="dimmed">
              Asking is not set up for this chest yet: it has no language model to answer with.
            </Text>
          </Paper>
        )}

        {earlier.length > 0 && (
          <Stack gap={6} data-testid="ask-earlier">
            <Text fw={600}>Your earlier questions</Text>
            {earlier.map((conversation) => (
              <Text key={conversation.id}>
                <TextLink href={`/ask/${conversation.id}`} data-testid="ask-earlier-link">
                  {conversation.title}
                </TextLink>{" "}
                <Text span c="dimmed" fz="sm">
                  {day.format(conversation.updatedAt)}
                </Text>
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
