import type { Metadata } from "next";
import { Code, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { FaceGroupCard } from "@/components/faces/FaceGroupCard";
import { LinkButton } from "@/components/LinkButton";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { TextLink } from "@/components/TextLink";
import { requireActor } from "@/server/auth/session";
import { listClaims } from "@/server/claims/service";
import { getFaceQueue } from "@/server/faces/service";
import { listPersonOptions } from "@/server/people/service";

export const metadata: Metadata = { title: "Who is this? · Hopechest" };

export default async function FacesPage({
  searchParams,
}: {
  searchParams: Promise<{ photo?: string; page?: string }>;
}) {
  const actor = await requireActor("write");
  const { photo, page } = await searchParams;
  const [queue, people, { waiting }] = await Promise.all([
    getFaceQueue(actor, { photoId: photo, page: Number(page) || 1 }),
    listPersonOptions(actor),
    listClaims(actor),
  ]);
  const address = (to: number) =>
    `/review/faces?${new URLSearchParams({ ...(photo ? { photo } : {}), page: String(to) })}`;

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="faces-title">
            Who is this?
          </Title>
          <Text c="dimmed">
            Faces found in the photos that nobody has named. Faces that look alike are grouped, so
            one answer names them all, and each name makes the next guess better.
          </Text>
        </div>
        <ReviewTabs
          current="faces"
          waitingFacts={waiting}
          waitingFaces={photo ? undefined : queue.waiting}
        />

        {photo && (
          <Text data-testid="faces-one-photo">
            Only the faces in <TextLink href={`/photos/${photo}`}>one photo</TextLink>.{" "}
            <TextLink href="/review/faces">See them all</TextLink>
          </Text>
        )}

        {queue.groups.length === 0 ? (
          <Paper withBorder p="lg" data-testid="faces-empty">
            {queue.scanned === 0 ? (
              <Stack gap="xs">
                <Text fw={600}>The photos have not been looked over for faces yet.</Text>
                <Text c="dimmed">
                  That happens from a terminal, with <Code>hopechest scan-faces</Code>. The faces it
                  finds show up here to be named.
                </Text>
              </Stack>
            ) : (
              <Text c="dimmed">
                {photo ? "No unnamed faces in this photo." : "Every face found so far has a name."}
                {queue.scanned < queue.photos &&
                  ` ${queue.photos - queue.scanned} photos have not been looked over yet.`}
              </Text>
            )}
          </Paper>
        ) : (
          <>
            <Text c="dimmed" data-testid="faces-count">
              {queue.waiting === 1 ? "1 face" : `${queue.waiting} faces`} in{" "}
              {queue.groupCount === 1 ? "1 group" : `${queue.groupCount} groups`}, biggest first.
            </Text>
            <Stack gap="md" data-testid="face-groups">
              {queue.groups.map((group) => (
                <FaceGroupCard key={group.key} group={group} people={people} />
              ))}
            </Stack>
            {queue.pages > 1 && (
              <Group justify="space-between">
                <LinkButton
                  href={address(queue.page - 1)}
                  variant="default"
                  disabled={queue.page <= 1}
                  data-testid="faces-previous"
                >
                  Previous
                </LinkButton>
                <Text c="dimmed" fz="sm">
                  Page {queue.page} of {queue.pages}
                </Text>
                <LinkButton
                  href={address(queue.page + 1)}
                  variant="default"
                  disabled={queue.page >= queue.pages}
                  data-testid="faces-next"
                >
                  More
                </LinkButton>
              </Group>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
