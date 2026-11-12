import type { Metadata } from "next";
import { Container, Stack, Title } from "@mantine/core";
import { AlbumForm } from "@/components/albums/AlbumForm";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "New album · Hopechest" };

export default async function NewAlbumPage() {
  await requireActor("write");
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} data-testid="new-album-title">
          New album
        </Title>
        <AlbumForm initial={{ title: "", description: "", cover: "" }} />
      </Stack>
    </Container>
  );
}
