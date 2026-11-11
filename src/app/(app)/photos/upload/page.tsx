import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { Uploader } from "@/components/photos/Uploader";
import { requireActor } from "@/server/auth/session";
import { getStorage } from "@/server/storage";

export const metadata: Metadata = { title: "Add photos · Hopechest" };

export default async function UploadPage() {
  await requireActor("write");
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="upload-title">
            Add photos
          </Title>
          <Text c="dimmed">
            The original is kept as it is. Captions, dates and names can be added afterwards, by
            anyone in the family.
          </Text>
        </div>
        <Uploader mode={getStorage().kind} />
      </Stack>
    </Container>
  );
}
