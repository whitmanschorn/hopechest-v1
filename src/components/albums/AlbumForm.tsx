"use client";

import { useActionState } from "react";
import { Button, Group, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { saveAlbumAction, type AlbumFormState } from "@/app/(app)/albums/actions";
import { LinkButton } from "@/components/LinkButton";
import type { AlbumFormInput } from "@/server/albums/service";
import classes from "./AlbumForm.module.css";

/** Name and description of an album; for an existing one, also which photo is on its cover. */
export function AlbumForm({
  id,
  initial,
  photos = [],
}: {
  id?: string;
  initial: AlbumFormInput;
  photos?: { id: string; thumbUrl: string; label: string }[];
}) {
  const start: AlbumFormState = { input: initial, errors: {} };
  const [state, action, pending] = useActionState(saveAlbumAction, start);
  const { input, errors } = state;

  return (
    <form action={action} key={JSON.stringify(input)} data-testid="album-form">
      {id && <input type="hidden" name="id" value={id} />}
      <Stack gap="md">
        <TextInput
          name="title"
          label="Name"
          description="Such as “Christmas 1987” or “Grandpa’s slides, box 3”"
          defaultValue={input.title}
          error={errors.title}
          required
          data-testid="album-title-input"
        />
        <Textarea
          name="description"
          label="About this album"
          autosize
          minRows={2}
          defaultValue={input.description}
          error={errors.description}
          data-testid="album-description-input"
        />
        {photos.length > 0 && (
          <div>
            <Text fw={500} fz="sm" id="album-cover-label">
              Cover photo
            </Text>
            <Text c="dimmed" fz="xs" mb="xs">
              Shown on the Albums page. If none is chosen, the first photo is used.
            </Text>
            <fieldset className={classes.covers} aria-labelledby="album-cover-label">
              {photos.map((photo) => (
                <label key={photo.id} className={classes.cover} data-testid="album-cover-choice">
                  <input
                    type="radio"
                    name="cover"
                    value={photo.id}
                    defaultChecked={input.cover === photo.id}
                    aria-label={photo.label}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbUrl} alt="" loading="lazy" />
                </label>
              ))}
            </fieldset>
          </div>
        )}
        <Group gap="sm">
          <Button type="submit" loading={pending} data-testid="save-album">
            {id ? "Save" : "Create album"}
          </Button>
          <LinkButton href={id ? `/albums/${id}` : "/albums"} variant="subtle">
            Cancel
          </LinkButton>
        </Group>
      </Stack>
    </form>
  );
}
