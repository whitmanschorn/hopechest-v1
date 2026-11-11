"use client";

import { useActionState } from "react";
import {
  Alert,
  Button,
  Fieldset,
  Group,
  NativeSelect,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { savePersonAction, type PersonFormState } from "@/app/(app)/people/actions";
import { LinkButton } from "@/components/LinkButton";
import type { PersonFormInput } from "@/lib/people/personEdit";

export interface RelativePreset {
  /** The person already in the chest. */
  slug: string;
  displayName: string;
  /** What that person is to the new one: "parent", "child" or "partner". */
  role: string;
}

const DATE_HINT = 'A full date, a year, or "around 1964"';

/** The add and edit form for a person. With `slug` it edits; without, it adds. */
export function PersonForm({
  initial,
  slug,
  relative,
  cancelHref,
}: {
  initial: PersonFormInput;
  slug?: string;
  relative?: RelativePreset;
  cancelHref: string;
}) {
  const start: PersonFormState = { input: initial, errors: {} };
  const [state, action, pending] = useActionState(savePersonAction, start);
  const { input, errors } = state;

  return (
    // Keyed so the fields show what was typed after a failed save.
    <form action={action} key={JSON.stringify(input)} data-testid="person-form">
      {slug && <input type="hidden" name="slug" value={slug} />}
      <Stack gap="lg">
        {state.message && (
          <Alert color="red" data-testid="form-error">
            {state.message}
          </Alert>
        )}

        {relative && (
          <Fieldset legend="Family">
            <input type="hidden" name="relativeOf" value={relative.slug} />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <NativeSelect
                name="relativeRole"
                label={`${relative.displayName} is this person's`}
                defaultValue={relative.role}
                data={[
                  { value: "parent", label: "Parent" },
                  { value: "child", label: "Child" },
                  { value: "partner", label: "Partner" },
                ]}
                data-testid="new-relative-role"
              />
              <NativeSelect
                name="relativeQualifier"
                label="Kind"
                defaultValue={relative.role === "partner" ? "married" : "biological"}
                data={[
                  {
                    group: "Parent and child",
                    items: ["biological", "adoptive", "step", "foster", "legal"],
                  },
                  { group: "Partners", items: ["married", "partnered"] },
                ]}
                data-testid="new-relative-qualifier"
              />
            </SimpleGrid>
          </Fieldset>
        )}

        <Fieldset legend="Names">
          <Stack gap="sm">
            <TextInput
              name="displayName"
              label="Name"
              description="As the family says it"
              defaultValue={input.displayName}
              error={errors.displayName}
              required
              data-testid="field-displayName"
            />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <TextInput name="givenName" label="Given name" defaultValue={input.givenName} />
              <TextInput name="familyName" label="Family name" defaultValue={input.familyName} />
              <TextInput
                name="birthFamilyName"
                label="Family name at birth"
                defaultValue={input.birthFamilyName}
              />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                name="nicknames"
                label="Nicknames"
                description="Separate with commas"
                defaultValue={input.nicknames}
                data-testid="field-nicknames"
              />
              <TextInput
                name="alternateNames"
                label="Also known as"
                description="Other spellings and names on records"
                defaultValue={input.alternateNames}
              />
            </SimpleGrid>
          </Stack>
        </Fieldset>

        <Fieldset legend="Life">
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                name="born"
                label="Born"
                description={DATE_HINT}
                defaultValue={input.born}
                error={errors.born}
                data-testid="field-born"
              />
              <TextInput
                name="died"
                label="Died"
                description={DATE_HINT}
                defaultValue={input.died}
                error={errors.died}
                data-testid="field-died"
              />
              <NativeSelect
                name="gender"
                label="Gender"
                description="Used for words like grandmother and uncle"
                defaultValue={input.gender}
                error={errors.gender}
                data={[
                  { value: "", label: "Not recorded" },
                  { value: "female", label: "Female" },
                  { value: "male", label: "Male" },
                  { value: "other", label: "Other" },
                ]}
                data-testid="field-gender"
              />
              <NativeSelect
                name="living"
                label="Living"
                defaultValue={input.living}
                error={errors.living}
                data={[
                  { value: "", label: "Not recorded" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </SimpleGrid>
            <Textarea
              name="notes"
              label="Notes"
              autosize
              minRows={3}
              defaultValue={input.notes}
              data-testid="field-notes"
            />
          </Stack>
        </Fieldset>

        <Group>
          <Button type="submit" loading={pending} data-testid="save-person">
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
