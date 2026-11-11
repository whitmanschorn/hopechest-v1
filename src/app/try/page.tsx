import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Container, Stack, Text, Title } from "@mantine/core";
import { getChestConfig } from "@/lib/chest";
import { hasDemoDoor } from "@/server/auth/service";
import { TryForm } from "./TryForm";

export const metadata: Metadata = { title: "Look around · Hopechest", robots: { index: false } };

/**
 * The demo door: with the demo password, anyone can look around this chest as
 * one of its members. Exists only where DEMO_PASSWORD is set, and never on a
 * family's own site.
 */
export default function TryPage() {
  return (
    <Suspense>
      <Door />
    </Suspense>
  );
}

async function Door() {
  // Decided per request, from this deployment's settings, not at build time.
  await connection();
  if (!hasDemoDoor()) notFound();
  return (
    <Container size={420} py={96}>
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="demo-title">
            Look around
          </Title>
          <Text c="dimmed">
            The {getChestConfig().name} chest is a test site with made-up data. Pick any family
            member and see it the way they would.
          </Text>
        </div>
        <TryForm />
      </Stack>
    </Container>
  );
}
