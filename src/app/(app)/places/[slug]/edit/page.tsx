import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Stack, Title } from "@mantine/core";
import { PlaceForm } from "@/components/places/PlaceForm";
import { toPlaceFormInput } from "@/lib/places/placeEdit";
import { requireActor } from "@/server/auth/session";
import { getPlace } from "@/server/places/service";

export const metadata: Metadata = { title: "Edit place · Hopechest" };

export default async function EditPlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActor("write");
  const { slug } = await params;
  const place = await getPlace(actor, slug);
  if (!place) notFound();

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} data-testid="edit-place-title">
          Edit {place.values.label}
        </Title>
        <PlaceForm
          initial={toPlaceFormInput(place.values)}
          slug={place.slug}
          cancelHref={`/places/${place.slug}`}
        />
      </Stack>
    </Container>
  );
}
