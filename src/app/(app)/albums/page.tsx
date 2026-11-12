import type { Metadata } from "next";
import Link from "next/link";
import { Container, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconPhoto, IconPlus } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { photoCountLabel } from "@/lib/albums";
import { can } from "@/server/actor";
import { listAlbums } from "@/server/albums/service";
import { requireActor } from "@/server/auth/session";
import classes from "@/components/albums/AlbumForm.module.css";

export const metadata: Metadata = { title: "Albums · Hopechest" };

export default async function AlbumsPage() {
  const actor = await requireActor("read");
  const albums = await listAlbums(actor);
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="albums-title">
              Albums
            </Title>
            <Text c="dimmed">Photos gathered by occasion, trip, or the box they came out of.</Text>
          </div>
          {can(actor, "write") && (
            <LinkButton
              href="/albums/new"
              leftSection={<IconPlus size={16} />}
              data-testid="new-album"
            >
              New album
            </LinkButton>
          )}
        </Group>

        {albums.length === 0 ? (
          <Text c="dimmed" data-testid="albums-empty">
            No albums yet.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="lg" data-testid="album-list">
            {albums.map((album) => (
              <Link
                key={album.id}
                href={`/albums/${album.id}`}
                className={classes.card}
                data-testid="album-card"
              >
                <div className={classes.cardCover}>
                  {album.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={album.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <IconPhoto size={36} stroke={1.2} aria-hidden />
                  )}
                </div>
                <Text fw={600} mt="xs" lh={1.3}>
                  {album.title}
                </Text>
                <Text c="dimmed" fz="sm">
                  {photoCountLabel(album.count)}
                </Text>
              </Link>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
