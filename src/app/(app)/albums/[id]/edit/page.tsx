import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Stack, Title } from "@mantine/core";
import { deleteAlbumAction } from "@/app/(app)/albums/actions";
import { AlbumForm } from "@/components/albums/AlbumForm";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { photoLabel } from "@/components/photos/PhotoGrid";
import { getAlbum } from "@/server/albums/service";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Edit album · Hopechest" };

export default async function EditAlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("write");
  const album = await getAlbum(actor, (await params).id);
  if (!album) notFound();

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} data-testid="edit-album-title">
          Edit album
        </Title>
        <AlbumForm
          id={album.id}
          initial={{
            title: album.title,
            description: album.description ?? "",
            cover: album.coverPhotoId ?? "",
          }}
          photos={album.photos.map((photo) => ({
            id: photo.id,
            thumbUrl: photo.thumbUrl,
            label: photoLabel(photo),
          }))}
        />
        <ConfirmDelete
          action={deleteAlbumAction}
          fields={{ id: album.id }}
          title="Delete this album?"
          data-testid="delete-album"
        >
          The album goes; its photos stay in the chest.
        </ConfirmDelete>
      </Stack>
    </Container>
  );
}
