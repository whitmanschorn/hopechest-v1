"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Anchor, Button, Group, Paper, Progress, Stack, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useMounted } from "@mantine/hooks";
import { IconPhotoUp } from "@tabler/icons-react";
import { upload } from "@vercel/blob/client";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, originalKey } from "@/lib/photos/keys";

type Status =
  | { state: "waiting" }
  | { state: "sending"; percent: number }
  | { state: "reading" }
  | { state: "done"; id: string; duplicate: boolean }
  | { state: "failed"; message: string };

interface Item {
  id: string;
  name: string;
  status: Status;
}

const ACCEPT = Object.keys(IMAGE_TYPES);
/** Enough to keep things moving without flooding a phone connection. */
const AT_ONCE = 3;

async function send(
  mode: "blob" | "local",
  item: Item,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  const key = originalKey(item.id, file.type);
  if (!key) throw new Error("That kind of file is not accepted.");
  if (mode === "blob") {
    await upload(key, file, {
      access: "private",
      handleUploadUrl: "/api/uploads",
      contentType: file.type,
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress(percentage),
    });
    return key;
  }
  const response = await fetch(`/api/uploads?id=${item.id}`, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok)
    throw new Error((await response.json().catch(() => null))?.error ?? "Upload failed.");
  onProgress(100);
  return key;
}

/** Drop or pick pictures; each is uploaded, then turned into a photo. */
export function Uploader({ mode }: { mode: "blob" | "local" }) {
  const [items, setItems] = useState<Item[]>([]);
  // Set once the page is interactive; files chosen before that would be lost.
  const ready = useMounted();
  const queue = useRef<{ item: Item; file: File }[]>([]);
  const running = useRef(0);

  const update = (id: string, status: Status) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));

  const pump = () => {
    while (running.current < AT_ONCE && queue.current.length > 0) {
      const { item, file } = queue.current.shift()!;
      running.current++;
      void (async () => {
        try {
          update(item.id, { state: "sending", percent: 0 });
          const key = await send(mode, item, file, (percent) =>
            update(item.id, { state: "sending", percent }),
          );
          update(item.id, { state: "reading" });
          const response = await fetch("/api/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, filename: file.name }),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok) throw new Error(result?.error ?? "Something went wrong.");
          update(item.id, { state: "done", id: result.id, duplicate: result.duplicate });
        } catch (error) {
          update(item.id, { state: "failed", message: (error as Error).message });
        } finally {
          running.current--;
          pump();
        }
      })();
    }
  };

  const add = (files: File[]) => {
    const added = files.map((file) => ({
      item: { id: crypto.randomUUID(), name: file.name, status: { state: "waiting" } as Status },
      file,
    }));
    queue.current.push(...added);
    setItems((current) => [...current, ...added.map(({ item }) => item)]);
    pump();
  };

  const reject = (names: string[]) =>
    setItems((current) => [
      ...current,
      ...names.map((name) => ({
        id: crypto.randomUUID(),
        name,
        status: {
          state: "failed",
          message: "Not accepted: use a JPEG, PNG, WebP, TIFF or GIF under 50 MB.",
        } as Status,
      })),
    ]);

  const finished = items.filter(
    (item) => item.status.state === "done" || item.status.state === "failed",
  );
  const allDone = items.length > 0 && finished.length === items.length;

  return (
    <Stack gap="lg">
      <Dropzone
        onDrop={add}
        onReject={(rejections) => reject(rejections.map((rejection) => rejection.file.name))}
        accept={ACCEPT}
        maxSize={MAX_UPLOAD_BYTES}
        inputProps={{ "data-testid": "upload-input" } as never}
        disabled={!ready}
        data-ready={ready}
        data-testid="upload-dropzone"
      >
        <Stack align="center" gap="xs" py="xl" style={{ pointerEvents: "none" }}>
          <IconPhotoUp size={40} stroke={1.5} />
          <Text fw={600} ta="center">
            Drop pictures here, or tap to choose them
          </Text>
          <Text c="dimmed" fz="sm" ta="center">
            As many as you like. JPEG, PNG, WebP, TIFF or GIF, up to 50 MB each.
          </Text>
        </Stack>
      </Dropzone>

      {items.length > 0 && (
        <Stack gap="xs" data-testid="upload-list" aria-live="polite">
          <Text c="dimmed" fz="sm" data-testid="upload-summary">
            {allDone
              ? `Finished: ${items.filter((item) => item.status.state === "done").length} of ${items.length} added.`
              : `${finished.length} of ${items.length} finished`}
          </Text>
          {items.map((item) => (
            <Paper
              key={item.id}
              p="sm"
              radius="md"
              withBorder
              bg="var(--hc-surface)"
              data-testid="upload-item"
              data-state={item.status.state}
            >
              <Group justify="space-between" gap="sm" wrap="nowrap">
                <Text fz="sm" style={{ overflowWrap: "anywhere" }}>
                  {item.name}
                </Text>
                <Text fz="sm" c={item.status.state === "failed" ? "red" : "dimmed"} ta="right">
                  {item.status.state === "waiting" && "Waiting"}
                  {item.status.state === "sending" && "Uploading"}
                  {item.status.state === "reading" && "Reading the picture"}
                  {item.status.state === "failed" && item.status.message}
                  {item.status.state === "done" && (
                    <Anchor
                      component={Link}
                      href={`/photos/${item.status.id}`}
                      data-testid="upload-link"
                    >
                      {item.status.duplicate ? "Already in the chest" : "Added. Add details"}
                    </Anchor>
                  )}
                </Text>
              </Group>
              {(item.status.state === "sending" || item.status.state === "reading") && (
                <Progress
                  mt={6}
                  size="sm"
                  value={item.status.state === "sending" ? item.status.percent : 100}
                  animated={item.status.state === "reading"}
                  aria-label={`Uploading ${item.name}`}
                />
              )}
            </Paper>
          ))}
          {allDone && (
            <Group>
              <Button component={Link} href="/photos" data-testid="upload-done">
                See them in Photos
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Stack>
  );
}
