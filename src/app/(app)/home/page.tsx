import type { Metadata } from "next";
import { Badge, Button, Container, Group, Stack, Text, Title } from "@mantine/core";
import { maskPhone } from "@/lib/auth/phone";
import { getChestConfig } from "@/lib/chest";
import { signOutAction } from "@/app/login/actions";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Home · Hopechest" };

export default async function HomePage() {
  const user = await requireUser();
  return (
    <Container size="sm" py={96}>
      <Stack gap="md">
        <Title order={1} data-testid="home-title">
          {getChestConfig().name}
        </Title>
        <Group gap="xs">
          <Text data-testid="signed-in-as">Signed in as {maskPhone(user.phone)}</Text>
          <Badge variant="light" data-testid="role-badge">
            {user.role.toLowerCase()}
          </Badge>
        </Group>
        <form action={signOutAction}>
          <Button type="submit" variant="default" data-testid="sign-out">
            Sign out
          </Button>
        </form>
      </Stack>
    </Container>
  );
}
