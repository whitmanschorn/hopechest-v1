import { Suspense } from "react";
import type { Metadata } from "next";
import { Alert, Container, Stack, Text, Title } from "@mantine/core";
import { LinkButton } from "@/components/LinkButton";
import { getChestConfig } from "@/lib/chest";
import { getJoin } from "@/server/invites/service";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = {
  title: "You're invited · Hopechest",
  robots: { index: false },
  // Keeps the link itself out of the address sent to any other site.
  referrer: "no-referrer",
};

/** Where an invite link lands: the invited person's name, and one button to get their code. */
export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Container size={460} py={96}>
      <Suspense>
        <Invitation params={params} />
      </Suspense>
    </Container>
  );
}

async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const join = await getJoin(token);
  const chest = getChestConfig().name;

  if (!join || join.state === "revoked" || join.state === "expired") {
    return (
      <Stack gap="md">
        <Title order={1} data-testid="join-title">
          This invitation isn&apos;t open
        </Title>
        <Alert color="yellow" data-testid="join-gone">
          {join?.state === "expired"
            ? "This link has run out. Ask whoever sent it to renew it; the same link will work again."
            : "This link doesn't work. Ask whoever sent it for a new one."}
        </Alert>
      </Stack>
    );
  }
  if (join.state === "accepted") {
    return (
      <Stack gap="md">
        <Title order={1} data-testid="join-title">
          You&apos;ve already joined
        </Title>
        <Text data-testid="join-used">
          This invitation has been used. Sign in with your mobile number.
        </Text>
        <div>
          <LinkButton href="/login">Sign in</LinkButton>
        </div>
      </Stack>
    );
  }
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} data-testid="join-title">
          Welcome, {join.name}
        </Title>
        <Text c="dimmed" data-testid="join-chest">
          You&apos;ve been invited to the {chest} chest: the family&apos;s photos, papers and
          stories, kept in one private place.
        </Text>
      </div>
      <JoinForm token={token} phoneHint={join.phoneHint!} />
    </Stack>
  );
}
