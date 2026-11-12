"use client";

import { useActionState, useRef } from "react";
import { Button, Group, MultiSelect, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  deletePhotoAction,
  savePhotoAction,
  type PhotoFormState,
} from "@/app/(app)/photos/actions";
import type { PhotoFormInput } from "@/server/photos/service";

/** Caption, date, photographer and who is in the picture; plus delete. */
export function PhotoForm({
  id,
  initial,
  people,
  albums,
}: {
  id: string;
  initial: PhotoFormInput;
  people: { value: string; label: string }[];
  albums: { value: string; label: string }[];
}) {
  const start: PhotoFormState = { input: initial, errors: {} };
  const [state, action, pending] = useActionState(savePhotoAction, start);
  const remove = useRef<HTMLFormElement>(null);
  // Set once the page is interactive; the pickers ignore typing before that.
  const ready = useMounted();
  const { input, errors } = state;

  return (
    <Stack gap="md">
      <form action={action} key={JSON.stringify(input)} data-testid="photo-form" data-ready={ready}>
        <input type="hidden" name="id" value={id} />
        <Stack gap="sm">
          <Textarea
            name="caption"
            label="Caption"
            description="Who, where, what was happening"
            autosize
            minRows={2}
            defaultValue={input.caption}
            error={errors.caption}
            data-testid="photo-caption-input"
          />
          <MultiSelect
            name="people"
            label="Who is in it"
            placeholder="Search the chest"
            data={people}
            defaultValue={input.people}
            searchable
            clearable
            nothingFoundMessage="No one by that name"
            error={errors.people}
            data-testid="photo-people-input"
          />
          {albums.length > 0 && (
            <MultiSelect
              name="albums"
              label="Albums"
              placeholder="Put it in an album"
              data={albums}
              defaultValue={input.albums}
              searchable
              clearable
              nothingFoundMessage="No album by that name"
              error={errors.albums}
              data-testid="photo-albums-input"
            />
          )}
          <Group grow align="flex-start">
            <TextInput
              name="date"
              label="When"
              description='A full date, a year, or "around 1964"'
              defaultValue={input.date}
              error={errors.date}
              data-testid="photo-date-input"
            />
            <TextInput
              name="photographer"
              label="Taken by"
              defaultValue={input.photographer}
              data-testid="photo-photographer-input"
            />
          </Group>
          <Group justify="space-between">
            <Button type="submit" loading={pending} data-testid="save-photo">
              Save
            </Button>
            <Button
              variant="subtle"
              color="red"
              data-testid="delete-photo"
              onClick={() =>
                modals.openConfirmModal({
                  title: "Delete this photo?",
                  centered: true,
                  children: (
                    <Text fz="sm">
                      The picture and its details are removed from the chest for everyone. This
                      cannot be undone.
                    </Text>
                  ),
                  labels: { confirm: "Delete", cancel: "Keep" },
                  confirmProps: { color: "red", "data-testid": "confirm-delete-photo" } as never,
                  onConfirm: () => remove.current?.requestSubmit(),
                })
              }
            >
              Delete photo
            </Button>
          </Group>
        </Stack>
      </form>
      <form ref={remove} action={deletePhotoAction}>
        <input type="hidden" name="id" value={id} />
      </form>
    </Stack>
  );
}
