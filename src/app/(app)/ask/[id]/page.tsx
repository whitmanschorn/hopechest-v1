import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, Container, Group, Stack, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { AskThread } from "@/components/ask/AskThread";
import { LinkButton } from "@/components/LinkButton";
import { getConversation } from "@/server/ask/service";
import { requireActor } from "@/server/auth/session";
import { deleteConversationAction } from "../actions";

export const metadata: Metadata = { title: "Ask · Hopechest" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("read");
  const conversation = await getConversation(actor, (await params).id);
  if (!conversation) notFound();
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <LinkButton
            href="/ask"
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
            data-testid="ask-new"
          >
            Ask something new
          </LinkButton>
          <form action={deleteConversationAction.bind(null, conversation.id)}>
            <Button
              type="submit"
              variant="subtle"
              color="gray"
              size="compact-sm"
              data-testid="ask-delete"
            >
              Delete this conversation
            </Button>
          </form>
        </Group>
        <Title order={2} data-testid="ask-conversation-title">
          {conversation.title}
        </Title>
        <AskThread
          key={conversation.id}
          conversationId={conversation.id}
          turns={conversation.turns}
          examples={[]}
        />
      </Stack>
    </Container>
  );
}
