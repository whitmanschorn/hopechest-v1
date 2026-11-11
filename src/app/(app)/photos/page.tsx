import type { Metadata } from "next";
import { Container, Group, Stack, Text, Title } from "@mantine/core";
import { IconPhotoUp } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { PhotoGrid } from "@/components/photos/PhotoGrid";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import { getPerson } from "@/server/people/service";
import { listPhotos } from "@/server/photos/service";

export const metadata: Metadata = { title: "Photos · Hopechest" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** `?person=<slug>` shows one person's photos; `?before=<id>` pages back in time. */
export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string | string[]; before?: string | string[] }>;
}) {
  const actor = await requireActor("read");
  const query = await searchParams;
  const personSlug = one(query.person);
  const person = personSlug ? await getPerson(actor, personSlug) : null;
  const { photos, next, total } = await listPhotos(actor, {
    person: person?.slug,
    before: one(query.before),
  });
  const more = new URLSearchParams({
    ...(person ? { person: person.slug } : {}),
    before: next ?? "",
  });

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="photos-title">
              {person ? `Photos of ${person.displayName}` : "Photos"}
            </Title>
            <Text c="dimmed" data-testid="photos-count">
              {total === 1 ? "1 photo" : `${total.toLocaleString("en-US")} photos`}
            </Text>
          </div>
          <Group gap="xs">
            {person && (
              <LinkButton href="/photos" variant="default" data-testid="photos-all">
                All photos
              </LinkButton>
            )}
            {can(actor, "write") && (
              <LinkButton
                href="/photos/upload"
                leftSection={<IconPhotoUp size={16} />}
                data-testid="upload-photos"
              >
                Add photos
              </LinkButton>
            )}
          </Group>
        </Group>

        {photos.length === 0 ? (
          <Text c="dimmed" data-testid="photos-empty">
            {person ? "No photos of them yet." : "No photos yet. The first one starts the album."}
          </Text>
        ) : (
          <PhotoGrid photos={photos} />
        )}

        {next && (
          <Group justify="center">
            <LinkButton href={`/photos?${more}`} variant="default" data-testid="photos-older">
              Older photos
            </LinkButton>
          </Group>
        )}
      </Stack>
    </Container>
  );
}
