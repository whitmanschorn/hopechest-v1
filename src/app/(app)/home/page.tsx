import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Home · Hopechest" };

export default async function HomePage() {
  await requireActor("read");
  return (
    <Container size="md" py="xl">
      <Stack gap="sm">
        <Title order={1} data-testid="home-title">
          Welcome
        </Title>
        <Text c="dimmed">Photos, people and stories will appear here as the chest fills up.</Text>
      </Stack>
    </Container>
  );
}
