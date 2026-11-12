import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconDownload } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { PhotoForm } from "@/components/photos/PhotoForm";
import { photoLabel } from "@/components/photos/PhotoGrid";
import { PhotoStage } from "@/components/photos/PhotoStage";
import { PhotoTalk } from "@/components/photos/PhotoTalk";
import { TextLink } from "@/components/TextLink";
import { describe } from "@/lib/fuzzyDate";
import { requireActor } from "@/server/auth/session";
import { listPersonOptions } from "@/server/people/service";
import { listAlbumOptions } from "@/server/albums/service";
import { getPhoto } from "@/server/photos/service";
import { getPhotoTalk } from "@/server/photos/talk";

export const metadata: Metadata = { title: "Photo · Hopechest" };

const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("read");
  const photo = await getPhoto(actor, (await params).id);
  if (!photo) notFound();
  const [people, albums, talk] = await Promise.all([
    photo.canEdit ? listPersonOptions(actor) : [],
    photo.canEdit ? listAlbumOptions(actor) : [],
    getPhotoTalk(actor, photo.id),
  ]);

  // What the form starts with: an exact date goes back in as typed-style text.
  const dateText = !photo.date
    ? ""
    : photo.date.precision === "day"
      ? `${photo.date.year}-${String(photo.date.month).padStart(2, "0")}-${String(photo.date.day).padStart(2, "0")}`
      : photo.date.precision === "month"
        ? `${photo.date.year}-${String(photo.date.month).padStart(2, "0")}`
        : photo.date.precision === "year"
          ? String(photo.date.year)
          : photo.date.display;

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <LinkButton
            href="/photos"
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
          >
            Photos
          </LinkButton>
          <LinkButton
            href={photo.originalUrl}
            variant="default"
            size="compact-sm"
            leftSection={<IconDownload size={14} />}
            data-testid="photo-original"
          >
            Original
          </LinkButton>
        </Group>

        <PhotoStage
          photoId={photo.id}
          src={photo.displayUrl}
          alt={photoLabel(photo)}
          width={photo.width}
          height={photo.height}
          tags={photo.people}
          canEdit={photo.canEdit}
        />

        {photo.waiting && (
          <Alert color="yellow" data-testid="photo-waiting">
            This photo is waiting for review. Only people who can add photos see it until it is
            published.
          </Alert>
        )}

        <Stack gap={4}>
          <Title order={1} fz="h3" data-testid="photo-caption">
            {photo.caption ?? "No caption yet"}
          </Title>
          <Text c="dimmed" data-testid="photo-date">
            {photo.date ? describe(photo.date) : "Date not recorded"}
            {photo.photographer && ` · Taken by ${photo.photographer}`}
          </Text>
          {photo.people.length > 0 && (
            <Text data-testid="photo-people">
              With{" "}
              {photo.people.map((person, index) => (
                <span key={person.slug}>
                  {index > 0 && ", "}
                  <TextLink href={`/people/${person.slug}`} inherit>
                    {person.displayName}
                  </TextLink>
                </span>
              ))}
            </Text>
          )}
          {photo.albums.length > 0 && (
            <Text data-testid="photo-albums">
              In{" "}
              {photo.albums.map((album, index) => (
                <span key={album.id}>
                  {index > 0 && ", "}
                  <TextLink href={`/albums/${album.id}`} inherit>
                    {album.title}
                  </TextLink>
                </span>
              ))}
            </Text>
          )}
          <Text c="dimmed" fz="sm">
            Added {photo.uploadedBy ? `by ${photo.uploadedBy} ` : ""}on{" "}
            {DAY.format(photo.uploadedAt)}
            {photo.originalFilename && ` · ${photo.originalFilename}`}
          </Text>
        </Stack>

        <PhotoTalk
          photoId={photo.id}
          reactions={talk.reactions}
          canTakePart={talk.canTakePart}
          comments={talk.comments.map(({ at, ...comment }) => ({
            ...comment,
            when: DAY.format(at),
          }))}
        />

        {photo.canEdit && (
          <Paper p="md" radius="md" withBorder bg="var(--hc-surface)">
            <PhotoForm
              id={photo.id}
              people={people}
              albums={albums}
              initial={{
                caption: photo.caption ?? "",
                date: dateText,
                photographer: photo.photographer ?? "",
                people: photo.people.map((person) => person.slug),
                albums: photo.albums.map((album) => album.id),
              }}
            />
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
