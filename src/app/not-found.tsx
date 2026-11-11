import { Container, Stack, Text, Title } from "@mantine/core";
import { LinkButton } from "@/components/LinkButton";

export default function NotFound() {
  return (
    <Container size="sm" py={96}>
      <Stack gap="md" align="flex-start">
        <Title order={1} data-testid="not-found-title">
          Nothing here
        </Title>
        <Text c="dimmed">That page doesn&apos;t exist, or it has moved.</Text>
        <LinkButton href="/home" variant="default">
          Back to the chest
        </LinkButton>
      </Stack>
    </Container>
  );
}
