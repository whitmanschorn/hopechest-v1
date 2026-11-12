"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, NativeSelect, PasswordInput, Select, Stack, Text } from "@mantine/core";
import { demoPasswordAction, demoStartAction, type TryState } from "./actions";

const START: TryState = { step: "password" };

export function TryForm() {
  const [entered, enter, checking] = useActionState(demoPasswordAction, START);
  const form = useRef<HTMLFormElement>(null);

  // A link can carry the password: /try?p=the-password. It is used once and
  // then removed from the address bar, so it is not left on screen or copied
  // along by accident. ("#the-password" works too, and never reaches the server.)
  useEffect(() => {
    const address = new URL(window.location.href);
    const fromLink = address.searchParams.get("p") ?? decodeURIComponent(address.hash.slice(1));
    if (!fromLink || !form.current) return;
    window.history.replaceState(null, "", address.pathname);
    const field = form.current.elements.namedItem("password");
    if (field instanceof HTMLInputElement) {
      field.value = fromLink;
      form.current.requestSubmit();
    }
  }, []);
  return entered.step === "pick" ? (
    <PickStep unlocked={entered} />
  ) : (
    <form ref={form} action={enter} data-testid="demo-password-form">
      <Stack gap="md">
        <PasswordInput
          name="password"
          label="Demo password"
          description="From whoever sent you here"
          error={entered.error}
          required
          autoFocus
          autoComplete="off"
          data-testid="demo-password"
        />
        <Button type="submit" loading={checking} data-testid="demo-unlock">
          Continue
        </Button>
      </Stack>
    </form>
  );
}

function PickStep({ unlocked }: { unlocked: Extract<TryState, { step: "pick" }> }) {
  const [state, start, starting] = useActionState(demoStartAction, unlocked);
  if (state.step !== "pick") return <TryForm />;
  return (
    <form action={start} data-testid="demo-pick-form">
      <Stack gap="md">
        <Select
          name="person"
          label="Look around as"
          placeholder="Choose a family member"
          data={state.people}
          searchable
          nothingFoundMessage="No one by that name"
          error={state.error}
          data-testid="demo-person"
        />
        <NativeSelect
          name="role"
          label="Able to"
          defaultValue="CONTRIBUTOR"
          data={[
            { value: "CONTRIBUTOR", label: "Add and edit" },
            { value: "VIEWER", label: "Look only" },
          ]}
          data-testid="demo-role"
        />
        <Button type="submit" loading={starting} data-testid="demo-start">
          Go
        </Button>
        <Text c="dimmed" fz="sm">
          You stay as this person until you sign out, or for twelve hours. To be someone else, sign
          out and come back to this page.
        </Text>
      </Stack>
    </form>
  );
}
