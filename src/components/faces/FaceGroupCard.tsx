"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Button, Group, Paper, Select, Stack, Text } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconCheck, IconPhoto } from "@tabler/icons-react";
import {
  ignoreFacesAction,
  nameFacesAction,
  rejectFacesAction,
  type FaceResult,
} from "@/app/(app)/review/faces/actions";
import type { FaceGroup } from "@/server/faces/service";
import classes from "./FaceGroupCard.module.css";

/**
 * Faces that are probably one person: say who, with one click when the chest
 * has a guess. A face that does not belong can be clicked out first.
 */
export function FaceGroupCard({
  group,
  people,
}: {
  group: FaceGroup;
  people: { value: string; label: string }[];
}) {
  const ready = useMounted();
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [person, setPerson] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const chosen = group.faces.filter((face) => !left.has(face.id)).map((face) => face.id);
  const decide = (action: () => Promise<FaceResult>) =>
    start(async () => {
      const result = await action();
      setProblem(result.ok ? null : result.message);
    });
  const toggle = (id: string) =>
    setLeft((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const guess = group.suggestion;
  const count = group.size === 1 ? "1 face" : `${group.size} faces`;

  return (
    <Paper withBorder p="md" radius="md" data-testid="face-group" data-ready={ready}>
      <Stack gap="sm">
        <Group justify="space-between" gap="xs">
          <Text fw={600} data-testid="face-group-size">
            {count}
          </Text>
          {group.size > group.faces.length && (
            <Text fz="sm" c="dimmed">
              Showing the clearest {group.faces.length}; the rest come back afterwards.
            </Text>
          )}
        </Group>

        <div className={classes.faces}>
          {group.faces.map((face) => (
            <div key={face.id} className={classes.tile}>
              <button
                type="button"
                className={classes.face}
                aria-pressed={!left.has(face.id)}
                aria-label={
                  left.has(face.id) ? "Left out. Put this face back" : "Leave this face out"
                }
                onClick={() => toggle(face.id)}
                data-testid="face-tile"
                data-face={face.id}
                data-photo={face.photoId}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={face.imageUrl}
                  alt=""
                  style={face.crop}
                  loading="lazy"
                  draggable={false}
                />
              </button>
              <Link
                href={`/photos/${face.photoId}`}
                className={classes.open}
                aria-label="See the whole photo"
                title="See the whole photo"
              >
                <IconPhoto size={14} />
              </Link>
            </div>
          ))}
        </div>
        {group.faces.length > 1 && (
          <Text fz="sm" c="dimmed">
            Someone who does not belong? Click their face to leave it out.
          </Text>
        )}

        {problem && (
          <Alert color="red" data-testid="face-problem">
            {problem}
          </Alert>
        )}

        {guess && (
          <Group gap="xs" data-testid="face-suggestion">
            <Text>
              {guess.reason === "looks"
                ? `Looks like ${guess.displayName}.`
                : `${guess.displayName} is tagged in ${group.faces.length === 1 ? "this photo" : "these photos"}.`}
            </Text>
            <Button
              size="compact-sm"
              leftSection={<IconCheck size={14} />}
              disabled={!ready || busy || chosen.length === 0}
              onClick={() => decide(() => nameFacesAction(chosen, guess.slug))}
              data-testid="face-yes"
            >
              Yes
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              disabled={!ready || busy || chosen.length === 0}
              onClick={() => decide(() => rejectFacesAction(chosen, guess.slug))}
              data-testid="face-no"
            >
              No
            </Button>
          </Group>
        )}

        <Group gap="xs" align="flex-end">
          <Select
            label={guess ? "Someone else" : "Who is this?"}
            placeholder="Search the chest"
            data={people}
            value={person}
            onChange={setPerson}
            searchable
            clearable
            nothingFoundMessage="No one by that name"
            style={{ flex: "1 1 220px" }}
            data-testid="face-person"
          />
          <Button
            disabled={!ready || busy || !person || chosen.length === 0}
            onClick={() => person && decide(() => nameFacesAction(chosen, person))}
            data-testid="face-name"
          >
            Name {chosen.length === 1 ? "this face" : `these ${chosen.length}`}
          </Button>
          <Button
            variant="subtle"
            color="gray"
            disabled={!ready || busy || chosen.length === 0}
            onClick={() => decide(() => ignoreFacesAction(chosen))}
            data-testid="face-ignore"
          >
            Nobody to name
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
