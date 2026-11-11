import { Container, Stack, Text, Title } from "@mantine/core";
import { getChestConfig } from "@/lib/chest";

export default function WelcomePage() {
  const chest = getChestConfig();
  return (
    <Container size="sm" py={96}>
      <Stack gap="md">
        <Title order={1} data-testid="welcome-title">
          Hopechest
        </Title>
        <Text size="lg" data-testid="chest-name">
          {chest.name}
        </Text>
        <Text c="dimmed">
          Your family&apos;s living archive: photos, documents, and stories, kept safe and
          rediscoverable.
        </Text>
      </Stack>
    </Container>
  );
}
