import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { DocumentForm } from "@/components/documents/DocumentForm";
import { requireActor } from "@/server/auth/session";
import { getStorage } from "@/server/storage";

export const metadata: Metadata = { title: "Add a document · Hopechest" };

export default async function NewDocumentPage() {
  await requireActor("write");
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="new-document-title">
            Add a document
          </Title>
          <Text c="dimmed">
            A letter, a certificate, a recipe card, a story someone wrote down. Its words become
            searchable, and facts recorded from it can point back to it.
          </Text>
        </div>
        <DocumentForm
          initial={{ title: "", kind: "other", date: "", text: "" }}
          mode={getStorage().kind}
        />
      </Stack>
    </Container>
  );
}
