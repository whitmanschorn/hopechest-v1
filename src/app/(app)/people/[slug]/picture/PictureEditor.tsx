"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Alert,
  Button,
  FileButton,
  Group,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconPhotoUp, IconTrash } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import {
  AVATAR_PIXELS,
  clampView,
  MAX_ZOOM,
  pan,
  sourceSquare,
  toStored,
  type CropView,
} from "@/lib/people/avatarCrop";
import { IMAGE_TYPES } from "@/lib/photos/keys";
import type { PictureSubject } from "@/server/people/picture";
import { removePictureAction, savePictureAction } from "./actions";
import classes from "./PictureEditor.module.css";

interface Source {
  url: string;
  /** Set when the picture is a photo already in the chest. */
  photoId: string | null;
  width: number;
  height: number;
}

const START: CropView = { cx: 0.5, cy: 0.5, zoom: 1 };
/** Browsers can show these; a TIFF scan cannot be previewed, so it is not offered here. */
const ACCEPT = Object.keys(IMAGE_TYPES)
  .filter((type) => type !== "image/tiff")
  .join(",");

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That picture could not be opened. Try another."));
    image.src = url;
  });
}

/** Choose a picture, place the face in the circle, save. */
export function PictureEditor({ subject, welcome }: { subject: PictureSubject; welcome: boolean }) {
  // Set once the page is interactive; a file chosen before that would be lost.
  const ready = useMounted();
  const [source, setSource] = useState<Source | null>(null);
  const [view, setView] = useState<CropView>(START);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const open = async (url: string, photoId: string | null) => {
    setError(null);
    try {
      const loaded = await loadImage(url);
      image.current = loaded;
      setSource({ url, photoId, width: loaded.naturalWidth, height: loaded.naturalHeight });
      setView(START);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const pick = (file: File | null) => {
    if (!file) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    void open(objectUrl.current, null);
  };

  const move = (dx: number, dy: number) => {
    if (source) setView((current) => pan(current, dx, dy, source.width, source.height));
  };

  const save = () => {
    if (!source || !image.current) return;
    const square = sourceSquare(view, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_PIXELS;
    const context = canvas.getContext("2d");
    if (!context) return setError("This browser cannot crop pictures.");
    context.drawImage(
      image.current,
      square.x,
      square.y,
      square.size,
      square.size,
      0,
      0,
      AVATAR_PIXELS,
      AVATAR_PIXELS,
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError("That picture could not be cropped. Try another.");
        const form = new FormData();
        form.set("image", new File([blob], "picture.jpg", { type: "image/jpeg" }));
        if (source.photoId) {
          form.set("photoId", source.photoId);
          form.set("crop", JSON.stringify(toStored(square, source.width, source.height)));
        }
        startSaving(async () => {
          const result = await savePictureAction(subject.slug, welcome, form);
          if (result?.message) setError(result.message);
        });
      },
      "image/jpeg",
      0.92,
    );
  };

  const square = source ? sourceSquare(view, source.width, source.height) : null;
  // The photo is drawn so that the chosen square exactly fills the round window.
  const placed =
    source && square
      ? {
          width: `${(source.width / square.size) * 100}%`,
          left: `${(-square.x / square.size) * 100}%`,
          top: `${(-square.y / square.size) * 100}%`,
        }
      : null;

  return (
    <Stack gap="lg" data-testid="picture-editor" data-ready={ready}>
      {error && (
        <Alert color="red" data-testid="picture-error">
          {error}
        </Alert>
      )}

      {source && placed ? (
        <Stack gap="md" align="center">
          <div
            className={classes.window}
            tabIndex={0}
            role="group"
            aria-label="Drag to move the picture inside the circle. Arrow keys also move it."
            data-testid="picture-window"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const size = event.currentTarget.clientWidth;
              move(
                (event.clientX - drag.current.x) / size,
                (event.clientY - drag.current.y) / size,
              );
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(event) => {
              const step: Record<string, [number, number]> = {
                ArrowLeft: [0.05, 0],
                ArrowRight: [-0.05, 0],
                ArrowUp: [0, 0.05],
                ArrowDown: [0, -0.05],
              };
              const by = step[event.key];
              if (!by) return;
              event.preventDefault();
              move(by[0], by[1]);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source.url} alt="" style={placed} draggable={false} />
          </div>
          <Stack gap={4} w="min(280px, 100%)">
            <Text fz="sm" c="dimmed" id="picture-zoom-label">
              Zoom
            </Text>
            <Slider
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view.zoom}
              onChange={(zoom) =>
                setView((current) => clampView({ ...current, zoom }, source.width, source.height))
              }
              label={null}
              aria-labelledby="picture-zoom-label"
              data-testid="picture-zoom"
            />
          </Stack>
          <Group gap="sm">
            <Button onClick={save} loading={saving} data-testid="picture-save">
              Save picture
            </Button>
            <Button
              variant="default"
              onClick={() => setSource(null)}
              disabled={saving}
              data-testid="picture-back"
            >
              Choose a different one
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="lg">
          <Group gap="sm">
            <FileButton
              onChange={pick}
              accept={ACCEPT}
              inputProps={{ "data-testid": "picture-file" } as never}
            >
              {(props) => (
                <Button
                  {...props}
                  disabled={!ready}
                  leftSection={<IconPhotoUp size={16} />}
                  data-testid="picture-upload"
                >
                  Upload a picture
                </Button>
              )}
            </FileButton>
            {subject.avatarUrl && (
              <Button
                variant="default"
                color="red"
                leftSection={<IconTrash size={16} />}
                loading={removing}
                onClick={() => startRemoving(() => removePictureAction(subject.slug))}
                data-testid="picture-remove"
              >
                Remove the current picture
              </Button>
            )}
            {welcome ? (
              <LinkButton href="/home" variant="subtle" data-testid="picture-skip">
                Skip for now
              </LinkButton>
            ) : (
              <LinkButton
                href={`/people/${subject.slug}`}
                variant="subtle"
                data-testid="picture-cancel"
              >
                Cancel
              </LinkButton>
            )}
          </Group>

          <div data-testid="picture-choices">
            <Text fw={600} mb="xs">
              {subject.isYou ? "Photos you are in" : `Photos ${subject.displayName} is in`}
            </Text>
            {subject.photos.length === 0 ? (
              <Text c="dimmed" data-testid="picture-no-choices">
                None yet. Once {subject.isYou ? "you are" : `${subject.displayName} is`} tagged in a
                photo, it will show here to choose from.
              </Text>
            ) : (
              <SimpleGrid cols={{ base: 3, sm: 5 }} spacing="sm">
                {subject.photos.map((photo) => (
                  <UnstyledButton
                    key={photo.id}
                    className={classes.choice}
                    onClick={() => void open(photo.displayUrl, photo.id)}
                    aria-label={
                      photo.caption ? `Use the photo: ${photo.caption}` : "Use this photo"
                    }
                    data-testid="picture-choice"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.thumbUrl} alt="" loading="lazy" />
                  </UnstyledButton>
                ))}
              </SimpleGrid>
            )}
          </div>
        </Stack>
      )}
    </Stack>
  );
}
