"use client";

import { useActionState } from "react";
import {
  Alert,
  Button,
  Fieldset,
  Group,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { savePlaceAction, type PlaceFormState } from "@/app/(app)/places/actions";
import { LinkButton } from "@/components/LinkButton";
import type { PlaceFormInput } from "@/lib/places/placeEdit";

/** The add and edit form for a place. With `slug` it edits; without, it adds. */
export function PlaceForm({
  initial,
  slug,
  cancelHref,
}: {
  initial: PlaceFormInput;
  slug?: string;
  cancelHref: string;
}) {
  const start: PlaceFormState = { input: initial, errors: {} };
  const [state, action, pending] = useActionState(savePlaceAction, start);
  const { input, errors } = state;

  return (
    // Keyed so the fields show what was typed after a failed save.
    <form action={action} key={JSON.stringify(input)} data-testid="place-form">
      {slug && <input type="hidden" name="slug" value={slug} />}
      <Stack gap="lg">
        {state.message && (
          <Alert color="red" data-testid="form-error">
            {state.message}
          </Alert>
        )}

        <Fieldset legend="Place">
          <Stack gap="sm">
            <TextInput
              name="label"
              label="Name"
              description="As the family says it"
              defaultValue={input.label}
              error={errors.label}
              required
              data-testid="field-label"
            />
            <TextInput
              name="street"
              label="Street"
              defaultValue={input.street}
              error={errors.street}
              data-testid="field-street"
            />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <TextInput
                name="city"
                label="City"
                defaultValue={input.city}
                error={errors.city}
                data-testid="field-city"
              />
              <TextInput
                name="region"
                label="State or region"
                defaultValue={input.region}
                error={errors.region}
                data-testid="field-region"
              />
              <TextInput
                name="country"
                label="Country"
                defaultValue={input.country}
                error={errors.country}
                data-testid="field-country"
              />
            </SimpleGrid>
            <Textarea
              name="notes"
              label="Notes"
              autosize
              minRows={3}
              defaultValue={input.notes}
              error={errors.notes}
              data-testid="field-notes"
            />
          </Stack>
        </Fieldset>

        <Fieldset legend="Pin on the map">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              name="lat"
              label="Latitude"
              description="Decimal degrees, north is positive. Leave both blank for no pin"
              inputMode="decimal"
              defaultValue={input.lat}
              error={errors.lat}
              data-testid="field-lat"
            />
            <TextInput
              name="lng"
              label="Longitude"
              description="Decimal degrees, east is positive"
              inputMode="decimal"
              defaultValue={input.lng}
              error={errors.lng}
              data-testid="field-lng"
            />
          </SimpleGrid>
        </Fieldset>

        <Group>
          <Button type="submit" loading={pending} data-testid="save-place">
            {slug ? "Save changes" : "Add to the chest"}
          </Button>
          <LinkButton href={cancelHref} variant="default">
            Cancel
          </LinkButton>
        </Group>
      </Stack>
    </form>
  );
}
