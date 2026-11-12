"use client";

import { useActionState } from "react";
import { upload } from "@vercel/blob/client";
import { Button, FileInput, Group, NativeSelect, Stack, Textarea, TextInput } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { saveDocumentAction, type DocumentFormState } from "@/app/(app)/documents/actions";
import { LinkButton } from "@/components/LinkButton";
import { DOCUMENT_KINDS, KIND_HINTS, KIND_LABELS } from "@/lib/documents/kinds";
import {
  DOCUMENT_TYPES,
  documentContentType,
  documentFileKey,
  MAX_UPLOAD_BYTES,
} from "@/lib/photos/keys";
import type { DocumentFormInput } from "@/server/documents/service";

/** Sends the file to where the site keeps files and returns its key. */
async function sendFile(mode: "blob" | "local", file: File): Promise<string> {
  const contentType = documentContentType(file.name, file.type);
  const id = crypto.randomUUID();
  const key = contentType ? documentFileKey(id, contentType) : null;
  if (!contentType || !key) throw new Error("Choose a PDF, a text file or a picture.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That file is larger than 50 MB.");
  if (mode === "blob") {
    await upload(key, file, {
      access: "private",
      handleUploadUrl: "/api/uploads",
      contentType,
      multipart: file.size > 8 * 1024 * 1024,
    });
    return key;
  }
  const response = await fetch(`/api/uploads?id=${id}&for=document`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => null))?.error ?? "Upload failed.");
  }
  return key;
}

/**
 * A document's title, kind, date and text. A new one may also bring a file:
 * a PDF or text file is read for its text; a picture of a page is kept as the
 * original, with what it says typed in here or later.
 */
export function DocumentForm({
  id,
  initial,
  mode,
}: {
  id?: string;
  initial: DocumentFormInput;
  /** How files are uploaded here; leave out when editing. */
  mode?: "blob" | "local";
}) {
  const ready = useMounted();
  const start: DocumentFormState = { input: initial, errors: {} };
  const [state, action, pending] = useActionState(
    async (previous: DocumentFormState, form: FormData): Promise<DocumentFormState> => {
      const file = form.get("file");
      form.delete("file");
      if (mode && file instanceof File && file.size > 0) {
        try {
          form.set("fileKey", await sendFile(mode, file));
          form.set("filename", file.name);
        } catch (error) {
          return {
            input: {
              title: String(form.get("title") ?? ""),
              kind: String(form.get("kind") ?? ""),
              date: String(form.get("date") ?? ""),
              text: String(form.get("text") ?? ""),
            },
            errors: { file: (error as Error).message },
          };
        }
      }
      return saveDocumentAction(previous, form);
    },
    start,
  );
  const { input, errors } = state;

  return (
    <form
      action={action}
      key={JSON.stringify(input) + JSON.stringify(errors)}
      data-testid="document-form"
      data-ready={ready}
    >
      {id && <input type="hidden" name="id" value={id} />}
      <Stack gap="md">
        {mode && (
          <FileInput
            name="file"
            label="The file, if there is one"
            description="A PDF or text file is read for its words. A photo of a page is kept as the original."
            placeholder="Choose a PDF, text file or picture"
            accept={[...Object.keys(DOCUMENT_TYPES), ".md", ".txt", ".pdf"].join(",")}
            clearable
            error={errors.file}
            data-testid="document-file-input"
          />
        )}
        <TextInput
          name="title"
          label="Title"
          description={
            mode
              ? "Such as “Letter from Klara to her sister, 1933”. Left empty, the file’s name is used."
              : undefined
          }
          defaultValue={input.title}
          error={errors.title}
          data-testid="document-title-input"
        />
        <Group grow align="flex-start">
          <NativeSelect
            name="kind"
            label="Kind"
            defaultValue={input.kind || "other"}
            error={errors.kind}
            data={DOCUMENT_KINDS.map((kind) => ({
              value: kind,
              label: `${KIND_LABELS[kind]}: ${KIND_HINTS[kind].toLowerCase()}`,
            }))}
            data-testid="document-kind-input"
          />
          <TextInput
            name="date"
            label="When it was written"
            placeholder="1933-05-02, 1933, around 1933"
            defaultValue={input.date}
            error={errors.date}
            data-testid="document-date-input"
          />
        </Group>
        <Textarea
          name="text"
          label="What it says"
          description={
            mode
              ? "Type or paste the words. Leave empty to use the words read from a PDF or text file."
              : "Start a line with ## to make a section heading."
          }
          autosize
          minRows={8}
          maxRows={30}
          defaultValue={input.text}
          error={errors.text}
          data-testid="document-text-input"
        />
        <Group gap="sm">
          <Button type="submit" loading={pending} data-testid="save-document">
            {id ? "Save" : "Add document"}
          </Button>
          <LinkButton href={id ? `/documents/${id}` : "/documents"} variant="default">
            Cancel
          </LinkButton>
        </Group>
      </Stack>
    </form>
  );
}
