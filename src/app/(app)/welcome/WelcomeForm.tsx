"use client";

import { useActionState } from "react";
import { Button, Stack, TextInput } from "@mantine/core";
import { saveWelcomeAction, type WelcomeState } from "./actions";

export function WelcomeForm({ initial }: { initial: WelcomeState["input"] }) {
  const [state, action, pending] = useActionState(saveWelcomeAction, {
    input: initial,
    errors: {},
  });
  return (
    <form action={action} key={JSON.stringify(state.input)} data-testid="welcome-form">
      <Stack gap="md">
        <TextInput
          name="displayName"
          label="Your name"
          description="As the family says it"
          defaultValue={state.input.displayName}
          error={state.errors.displayName}
          required
          data-testid="welcome-name"
        />
        <TextInput
          name="born"
          label="Your birthday"
          description="A full date like 1990-09-22, or just the year. Leave it blank if you would rather not say"
          defaultValue={state.input.born}
          error={state.errors.born}
          data-testid="welcome-born"
        />
        <div>
          <Button type="submit" loading={pending} data-testid="welcome-save">
            Looks right
          </Button>
        </div>
      </Stack>
    </form>
  );
}
