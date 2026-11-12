"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconCheck, IconUserScan } from "@tabler/icons-react";
import { setTagBoxAction } from "@/app/(app)/photos/actions";
import { boxFromDrag, type Box } from "@/lib/photos/box";
import classes from "./PhotoStage.module.css";

interface Tag {
  slug: string;
  displayName: string;
  box: Box | null;
}

type Point = { x: number; y: number };

const place = (box: Box) => ({
  left: `${box.x}%`,
  top: `${box.y}%`,
  width: `${box.w}%`,
  height: `${box.h}%`,
});

/**
 * The photo, with a named box over each person whose place has been marked.
 * People who can edit pick a tagged person and drag a box around their face.
 */
export function PhotoStage({
  photoId,
  src,
  alt,
  width,
  height,
  tags,
  canEdit,
}: {
  photoId: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  tags: Tag[];
  canEdit: boolean;
}) {
  const ready = useMounted();
  const [show, setShow] = useState(false);
  /** Slug of the person being marked, if any. */
  const [marking, setMarking] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<Box | null>(null);
  const [saving, startSaving] = useTransition();
  const from = useRef<Point | null>(null);

  const point = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  };

  const save = (slug: string, box: Box | null) =>
    startSaving(async () => {
      await setTagBoxAction(photoId, slug, box);
      setMarking(null);
      setDrawing(null);
    });

  const marked = tags.filter((tag) => tag.box);
  const active = tags.find((tag) => tag.slug === marking);

  return (
    <Stack gap="sm">
      <div className={classes.frame}>
        <div
          className={classes.stage}
          data-testid="photo-stage"
          data-show={show || marking !== null}
          data-marking={marking !== null}
          // As wide as fits, but never taller than most of the screen.
          style={{
            aspectRatio: `${width} / ${height}`,
            width: `min(100%, ${width}px, calc(78vh * ${width / height}))`,
          }}
          onPointerDown={(event) => {
            if (!marking || saving) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            from.current = point(event);
          }}
          onPointerMove={(event) => {
            if (from.current) setDrawing(boxFromDrag(from.current, point(event)));
          }}
          onPointerUp={(event) => {
            if (!from.current || !marking) return;
            const box = boxFromDrag(from.current, point(event));
            from.current = null;
            if (box) save(marking, box);
            else setDrawing(null);
          }}
          onPointerCancel={() => {
            from.current = null;
            setDrawing(null);
          }}
        >
          {/* Served by /api/files behind the session, so next/image's optimizer cannot fetch it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            draggable={false}
            data-testid="photo-image"
          />
          {marked
            // While someone is being re-marked, their old box steps aside for the new one.
            .filter((tag) => !(drawing && tag.slug === marking))
            .map((tag) => (
              <div
                key={tag.slug}
                className={classes.box}
                style={place(tag.box!)}
                data-active={tag.slug === marking}
                data-testid="face-box"
                data-person={tag.slug}
              >
                <span className={classes.name}>{tag.displayName}</span>
              </div>
            ))}
          {drawing && <div className={classes.box} style={place(drawing)} data-drawing="true" />}
        </div>
      </div>

      {(marked.length > 0 || (canEdit && tags.length > 0)) && (
        <Group gap="xs" data-testid="face-tools" data-ready={ready}>
          {marked.length > 0 && !marking && (
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<IconUserScan size={14} />}
              aria-pressed={show}
              onClick={() => setShow((current) => !current)}
              data-testid="show-faces"
            >
              {show ? "Hide names" : "Show who is where"}
            </Button>
          )}
          {canEdit &&
            !marking &&
            tags.map((tag) => (
              <Button
                key={tag.slug}
                variant="subtle"
                size="compact-sm"
                leftSection={tag.box ? <IconCheck size={14} /> : undefined}
                disabled={!ready}
                onClick={() => setMarking(tag.slug)}
                data-testid={`mark-${tag.slug}`}
              >
                {tag.box ? `Move ${tag.displayName}'s box` : `Mark ${tag.displayName}`}
              </Button>
            ))}
          {active && (
            <>
              <Text fz="sm" data-testid="marking-hint" aria-live="polite">
                Drag a box around {active.displayName}&apos;s face.
              </Text>
              {active.box && (
                <Button
                  variant="default"
                  size="compact-sm"
                  loading={saving}
                  onClick={() => save(active.slug, null)}
                  data-testid="clear-box"
                >
                  Remove the box
                </Button>
              )}
              <Button
                variant="subtle"
                size="compact-sm"
                disabled={saving}
                onClick={() => {
                  setMarking(null);
                  setDrawing(null);
                }}
                data-testid="stop-marking"
              >
                Cancel
              </Button>
            </>
          )}
        </Group>
      )}
    </Stack>
  );
}
