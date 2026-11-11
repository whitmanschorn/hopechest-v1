import type { Metadata } from "next";
import { Container, Stack, Title } from "@mantine/core";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Hopechest" };

export default function LoginPage() {
  return (
    <Container size={420} py={96}>
      <Stack gap="lg">
        <Title order={1}>Sign in</Title>
        <LoginForm />
      </Stack>
    </Container>
  );
}
