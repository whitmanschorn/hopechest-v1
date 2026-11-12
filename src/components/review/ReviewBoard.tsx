"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Checkbox, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconCheck, IconFileText, IconTrash } from "@tabler/icons-react";
import {
  dateAction,
  discardAction,
  publishAction,
  type ReviewResult,
} from "@/app/(app)/review/actions";
import { LinkButton } from "@/components/LinkButton";
import { TextLink } from "@/components/TextLink";
import classes from "./ReviewBoard.module.css";

export interface ReviewTile {
  id: string;
  thumbUrl: string;
  alt: string;
  filename: string | null;
  caption: string | null;
  date: string | null;
  people: string[];
  problems: string[];
}

export interface ReviewPaper {
  id: string;
  title: string;
  kind: string;
  date: string | null;
  filename: string | null;
  hasText: boolean;
  problems: string[];
}

/** What a batch brought that is still waiting: pick some or all, date photos, publish or discard. */
export function ReviewBoard({
  batchId,
  photos,
  documents,
}: {
  batchId: string;
  photos: ReviewTile[];
  documents: ReviewPaper[];
}) {
  const ready = useMounted();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [date, setDate] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, start] = useTransition();

  // Photos can leave the page (published, discarded) while still picked.
  const everything = [...documents, ...photos].map((entry) => entry.id);
  const chosen = everything.filter((id) => picked.has(id));
  const chosenPhotos = photos.filter((photo) => picked.has(photo.id)).map((photo) => photo.id);
  const run = (action: () => Promise<ReviewResult>, clear = true) =>
    start(async () => {
      const answer = await action();
      setResult(answer);
      if (answer.ok && clear) setPicked(new Set());
    });
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Stack gap="md" data-testid="review-board" data-ready={ready}>
      {result && (
        <Alert color={result.ok ? "green" : "red"} data-testid="review-result">
          {result.message}
        </Alert>
      )}

      {everything.length === 0 ? (
        <Paper withBorder p="lg" data-testid="review-done">
          <Group justify="space-between">
            <Text>Nothing in this batch is waiting for review.</Text>
            <Group gap="xs">
              <LinkButton href="/photos" variant="default">
                See the photos
              </LinkButton>
              <LinkButton href="/documents" variant="default">
                See the documents
              </LinkButton>
            </Group>
          </Group>
        </Paper>
      ) : (
        <>
          <div className={classes.bar}>
            <Group justify="space-between" gap="sm">
              <Group gap="sm">
                <Checkbox
                  label={chosen.length > 0 ? `${chosen.length} picked` : "Pick all"}
                  checked={chosen.length === everything.length}
                  indeterminate={chosen.length > 0 && chosen.length < everything.length}
                  onChange={(event) =>
                    setPicked(new Set(event.currentTarget.checked ? everything : []))
                  }
                  data-testid="review-pick-all"
                />
                <TextInput
                  aria-label="Date for the picked photos"
                  disabled={photos.length === 0}
                  placeholder='Date, e.g. "1974"'
                  size="xs"
                  w={150}
                  value={date}
                  onChange={(event) => setDate(event.currentTarget.value)}
                  data-testid="review-date"
                />
                <Button
                  size="xs"
                  variant="default"
                  disabled={chosenPhotos.length === 0 || !date.trim() || busy}
                  onClick={() => run(() => dateAction(batchId, chosenPhotos, date), false)}
                  data-testid="review-set-date"
                >
                  Set date
                </Button>
              </Group>
              <Group gap="sm">
                <Button
                  size="xs"
                  variant="default"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  disabled={chosen.length === 0 || busy}
                  onClick={() => run(() => discardAction(batchId, chosen))}
                  data-testid="review-discard"
                >
                  Discard
                </Button>
                <Button
                  size="xs"
                  leftSection={<IconCheck size={14} />}
                  loading={busy}
                  onClick={() =>
                    run(() => publishAction(batchId, chosen.length > 0 ? chosen : null))
                  }
                  data-testid="review-publish"
                >
                  {chosen.length > 0
                    ? `Publish ${chosen.length} picked`
                    : `Publish all ${everything.length}`}
                </Button>
              </Group>
            </Group>
          </div>

          {documents.length > 0 && (
            <Stack gap={0} data-testid="review-documents">
              {documents.map((doc) => (
                <label key={doc.id} className={classes.paper} data-testid="review-document">
                  <input
                    type="checkbox"
                    checked={picked.has(doc.id)}
                    onChange={() => toggle(doc.id)}
                    aria-label={`Pick ${doc.title}`}
                    data-testid="review-pick"
                  />
                  <div>
                    <Text fz="sm" fw={500}>
                      <IconFileText size={14} aria-hidden /> {doc.title}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {doc.kind} · {doc.date ?? "no date yet"}
                      {doc.hasText ? "" : " · not typed out yet"}
                      {doc.filename ? ` · ${doc.filename}` : ""}
                    </Text>
                    {doc.problems.map((problem) => (
                      <Text key={problem} fz="xs" c="orange" data-testid="review-problem">
                        {problem}
                      </Text>
                    ))}
                    <TextLink href={`/documents/${doc.id}`} fz="xs" data-testid="review-open">
                      Open to read or edit
                    </TextLink>
                  </div>
                </label>
              ))}
            </Stack>
          )}

          <div className={classes.grid} data-testid="review-grid">
            {photos.map((photo) => (
              <div key={photo.id} className={classes.tile} data-testid="review-tile">
                <label className={classes.pick}>
                  {/* Served by /api/files behind the session, so next/image's optimizer cannot fetch it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbUrl} alt={photo.alt} loading="lazy" decoding="async" />
                  <input
                    type="checkbox"
                    checked={picked.has(photo.id)}
                    onChange={() => toggle(photo.id)}
                    aria-label={`Pick ${photo.filename ?? photo.alt}`}
                    data-testid="review-pick"
                  />
                </label>
                <div>
                  <Text fz="sm" fw={500} lineClamp={2} data-testid="review-caption">
                    {photo.caption ?? "No caption yet"}
                  </Text>
                  <Text fz="xs" c="dimmed" data-testid="review-date-shown">
                    {photo.date ?? "No date yet"}
                  </Text>
                  {photo.people.length > 0 && (
                    <Text fz="xs" data-testid="review-people">
                      {photo.people.join(", ")}
                    </Text>
                  )}
                  {photo.problems.map((problem) => (
                    <Text key={problem} fz="xs" c="orange" data-testid="review-problem">
                      {problem}
                    </Text>
                  ))}
                  <Text fz="xs" c="dimmed" truncate>
                    {photo.filename}
                  </Text>
                  <TextLink href={`/photos/${photo.id}`} fz="xs" data-testid="review-open">
                    Open to edit
                  </TextLink>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Stack>
  );
}
