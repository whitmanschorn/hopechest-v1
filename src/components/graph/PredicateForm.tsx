"use client";

import { useActionState, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NativeSelect,
  Stack,
  TextInput,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { createPredicateAction, type PredicateFormState } from "@/app/(app)/graph/actions";
import { KIND_LABELS, NODE_KINDS } from "@/lib/graph/vocabulary";

const KINDS = NODE_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }));

/** Adds a family's own kind of fact: how it reads, what it is said about, what it points at. */
export function PredicateForm() {
  const ready = useMounted();
  const start: PredicateFormState = { errors: {}, added: null };
  const [state, action, pending] = useActionState(createPredicateAction, start);
  const [value, setValue] = useState("entity");
  const [symmetric, setSymmetric] = useState(false);
  // Held here because a form is cleared after it is sent, and what was typed
  // must survive being told something is missing.
  const [text, setText] = useState({ label: "", inverse: "", description: "" });
  const [sentFor, setSentFor] = useState<string | null>(null);
  if (state.added && state.added !== sentFor) {
    setSentFor(state.added);
    setText({ label: "", inverse: "", description: "" });
  }
  const typed = (name: keyof typeof text) => ({
    value: text[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setText({ ...text, [name]: event.currentTarget.value }),
  });
  return (
    <form action={action} data-testid="predicate-form" data-ready={ready}>
      <Stack gap="sm">
        {state.added && (
          <Alert color="green" data-testid="predicate-added">
            Added “{state.added}”. It can be used on any page now.
          </Alert>
        )}
        <Group grow align="flex-start">
          <TextInput
            name="label"
            label="How it reads"
            placeholder="taught piano to"
            description="Someone … someone or something"
            {...typed("label")}
            error={state.errors.label}
            required
            data-testid="predicate-label"
          />
          <NativeSelect
            name="value"
            label="It points at"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            error={state.errors.value}
            data={[
              { value: "entity", label: "A person, place or thing" },
              { value: "text", label: "A few words" },
              { value: "date", label: "A date" },
              { value: "number", label: "A number" },
            ]}
            data-testid="predicate-value"
          />
        </Group>
        {value === "entity" && (
          <>
            <Checkbox
              name="symmetric"
              label="It reads the same both ways (like “friend of”)"
              checked={symmetric}
              onChange={(event) => setSymmetric(event.currentTarget.checked)}
            />
            {!symmetric && (
              <TextInput
                name="inverse"
                label="How it reads the other way round"
                placeholder="learned piano from"
                {...typed("inverse")}
                error={state.errors.inverse}
                data-testid="predicate-inverse"
              />
            )}
          </>
        )}
        <Group grow align="flex-start">
          <MultiSelect
            name="subjects"
            label="Can be said about"
            placeholder="Anything"
            data={KINDS}
            error={state.errors.kinds}
            clearable
          />
          {value === "entity" && (
            <MultiSelect
              name="objects"
              label="Can point at"
              placeholder="Anything"
              data={KINDS}
              clearable
            />
          )}
        </Group>
        <TextInput name="description" label="When to use it (optional)" {...typed("description")} />
        <div>
          <Button type="submit" loading={pending} data-testid="predicate-save">
            Add this kind of fact
          </Button>
        </div>
      </Stack>
    </form>
  );
}
