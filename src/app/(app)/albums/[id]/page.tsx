import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Group, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconPencil, IconPhotoUp } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { PhotoGrid } from "@/components/photos/PhotoGrid";
import { photoCountLabel } from "@/lib/albums";
import { getAlbum } from "@/server/albums/service";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Album · Hopechest" };

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("read");
  const album = await getAlbum(actor, (await params).id);
  if (!album) notFound();

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <LinkButton
            href="/albums"
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
          >
            Albums
          </LinkButton>
        </div>
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="album-title">
              {album.title}
            </Title>
            <Text c="dimmed" data-testid="album-count">
              {photoCountLabel(album.count)}
            </Text>
          </div>
          {album.canEdit && (
            <Group gap="xs">
              <LinkButton
                href={`/albums/${album.id}/edit`}
                variant="default"
                leftSection={<IconPencil size={16} />}
                data-testid="edit-album"
              >
                Edit
              </LinkButton>
              <LinkButton
                href={`/photos/upload?album=${album.id}`}
                leftSection={<IconPhotoUp size={16} />}
                data-testid="album-add-photos"
              >
                Add photos
              </LinkButton>
            </Group>
          )}
        </Group>
        {album.description && (
          <Text style={{ whiteSpace: "pre-wrap" }} data-testid="album-description">
            {album.description}
          </Text>
        )}
        {album.photos.length === 0 ? (
          <Text c="dimmed" data-testid="album-empty">
            {album.canEdit
              ? "Nothing in here yet. Add photos, or open a photo already in the chest and put it in this album."
              : "Nothing in here yet."}
          </Text>
        ) : (
          <PhotoGrid photos={album.photos} />
        )}
      </Stack>
    </Container>
  );
}
