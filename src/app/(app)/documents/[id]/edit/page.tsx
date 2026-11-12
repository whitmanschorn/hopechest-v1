import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Divider, Stack, Text, Title } from "@mantine/core";
import { deleteDocumentAction } from "@/app/(app)/documents/actions";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { DocumentForm } from "@/components/documents/DocumentForm";
import { dateToText } from "@/lib/events/eventEdit";
import { requireActor } from "@/server/auth/session";
import { getDocument } from "@/server/documents/service";

export const metadata: Metadata = { title: "Edit a document · Hopechest" };

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("write");
  const doc = await getDocument(actor, (await params).id);
  if (!doc) notFound();
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} data-testid="edit-document-title">
          Edit {doc.title}
        </Title>
        <DocumentForm
          id={doc.id}
          initial={{
            title: doc.title,
            kind: doc.kind,
            date: dateToText(doc.date),
            text: doc.text ?? "",
          }}
        />
        <Divider />
        {doc.citedBy > 0 ? (
          <Text c="dimmed" fz="sm" data-testid="document-cited">
            {doc.citedBy === 1
              ? "A recorded fact cites this document, so it cannot be deleted."
              : `${doc.citedBy} recorded facts cite this document, so it cannot be deleted.`}
          </Text>
        ) : (
          <div>
            <ConfirmDelete
              action={deleteDocumentAction}
              fields={{ id: doc.id }}
              title="Delete this document?"
              data-testid="delete-document"
            >
              Its text and its file are removed from the chest. This cannot be undone.
            </ConfirmDelete>
          </div>
        )}
      </Stack>
    </Container>
  );
}
