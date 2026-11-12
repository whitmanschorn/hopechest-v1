import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Stack, Text, Title } from "@mantine/core";
import { requireActor } from "@/server/auth/session";
import { getPictureSubject } from "@/server/people/picture";
import { PictureEditor } from "./PictureEditor";

export const metadata: Metadata = { title: "Profile picture · Hopechest" };

export default async function PicturePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const actor = await requireActor("read");
  const { slug } = await params;
  const subject = await getPictureSubject(actor, slug);
  if (!subject) notFound();
  const welcome = (await searchParams).from === "welcome" && subject.isYou;

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="picture-title">
            {welcome
              ? "Add a picture of yourself"
              : subject.isYou
                ? "Your profile picture"
                : `Picture of ${subject.displayName}`}
          </Title>
          <Text c="dimmed">
            {welcome
              ? "So the family can see who is who. You can skip this and add one later."
              : "Choose a picture, then drag and zoom until the face sits in the circle."}
          </Text>
        </div>
        <PictureEditor subject={subject} welcome={welcome} />
      </Stack>
    </Container>
  );
}
