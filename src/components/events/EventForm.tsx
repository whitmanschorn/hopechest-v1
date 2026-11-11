"use client";

import { useActionState, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Fieldset,
  Group,
  NativeSelect,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { saveEventAction, type EventFormState } from "@/app/(app)/events/actions";
import { LinkButton } from "@/components/LinkButton";
import { EVENT_KINDS, KIND_LABELS, type EventFormInput } from "@/lib/events/eventEdit";
import { ParticipantPicker } from "./ParticipantPicker";

const KIND_OPTIONS = EVENT_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }));

interface Option {
  value: string;
  label: string;
}

/** The add and edit form for an event. With `id` it edits; without, it adds. */
export function EventForm({
  initial,
  id,
  people,
  places,
  cancelHref,
}: {
  initial: EventFormInput;
  id?: string;
  people: Option[];
  places: Option[];
  cancelHref: string;
}) {
  const start: EventFormState = { input: initial, errors: {} };
  const [state, action, pending] = useActionState(saveEventAction, start);

  return (
    // Keyed so the fields show what was entered after a failed save.
    <Fields
      key={JSON.stringify(state.input)}
      state={state}
      action={action}
      pending={pending}
      id={id}
      people={people}
      places={places}
      cancelHref={cancelHref}
    />
  );
}

function Fields({
  state,
  action,
  pending,
  id,
  people,
  places,
  cancelHref,
}: {
  state: EventFormState;
  action: (form: FormData) => void;
  pending: boolean;
  id?: string;
  people: Option[];
  places: Option[];
  cancelHref: string;
}) {
  const { input, errors } = state;
  const [deduced, setDeduced] = useState(input.deduced === "yes");

  return (
    <form action={action} data-testid="event-form">
      {id && <input type="hidden" name="id" value={id} />}
      <Stack gap="lg">
        {state.message && (
          <Alert color="red" data-testid="form-error">
            {state.message}
          </Alert>
        )}

        <Fieldset legend="What happened">
          <Stack gap="sm">
            <NativeSelect
              name="kind"
              label="Kind"
              data={KIND_OPTIONS}
              defaultValue={input.kind}
              error={errors.kind}
              data-testid="field-kind"
            />
            <TextInput
              name="title"
              label="Title"
              description='A short line, such as "Michael and Tracey marry"'
              defaultValue={input.title}
              error={errors.title}
              required
              data-testid="field-title"
            />
            <Textarea
              name="description"
              label="Description"
              autosize
              minRows={3}
              defaultValue={input.description}
              error={errors.description}
              data-testid="field-description"
            />
          </Stack>
        </Fieldset>

        <Fieldset legend="When and where">
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                name="date"
                label="Date"
                description='A full date, a year, or "around 1964"'
                defaultValue={input.date}
                error={errors.date}
                data-testid="field-date"
              />
              <NativeSelect
                name="place"
                label="Place"
                description="Add new places under Places"
                data={[{ value: "", label: "Not recorded" }, ...places]}
                defaultValue={input.place}
                error={errors.place}
                data-testid="field-place"
              />
            </SimpleGrid>
            <Checkbox
              name="deduced"
              value="yes"
              label="This date is a deduction, not read off a record"
              checked={deduced}
              onChange={(event) => setDeduced(event.currentTarget.checked)}
              data-testid="field-deduced"
            />
            {deduced && (
              <Textarea
                name="clue"
                label="What the deduction rests on"
                description="Shown next to the date, so no one mistakes it for a record"
                autosize
                minRows={2}
                defaultValue={input.clue}
                error={errors.clue}
                data-testid="field-clue"
              />
            )}
          </Stack>
        </Fieldset>

        <Fieldset legend="Who took part">
          <ParticipantPicker
            people={people}
            initial={input.participants}
            error={errors.participants}
          />
        </Fieldset>

        <Group>
          <Button type="submit" loading={pending} data-testid="save-event">
            {id ? "Save changes" : "Add to the chest"}
          </Button>
          <LinkButton href={cancelHref} variant="default">
            Cancel
          </LinkButton>
        </Group>
      </Stack>
    </form>
  );
}
