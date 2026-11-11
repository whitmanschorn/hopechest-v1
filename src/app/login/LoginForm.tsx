"use client";

import { useActionState } from "react";
import { Alert, Anchor, Button, Group, PinInput, Stack, Text, TextInput } from "@mantine/core";
import { formatPhone } from "@/lib/auth/phone";
import { requestCodeAction, verifyCodeAction, type LoginState } from "./actions";

const START: LoginState = { step: "phone" };

export function LoginForm() {
  const [requested, requestAction, requesting] = useActionState(requestCodeAction, START);
  // Keyed on the request so asking for a new code clears the old error.
  return requested.step === "code" ? (
    <CodeStep key={`${requested.phone}:${requested.devCode ?? ""}`} sent={requested} />
  ) : (
    <form action={requestAction}>
      <Stack gap="md">
        <TextInput
          name="phone"
          type="tel"
          label="Mobile number"
          description="We'll text you a code. No passwords, ever."
          placeholder="(555) 555-0123"
          autoComplete="tel"
          error={requested.error}
          required
          autoFocus
          data-testid="phone-input"
        />
        <Button type="submit" loading={requesting} data-testid="send-code">
          Text me a code
        </Button>
      </Stack>
    </form>
  );
}

function CodeStep({ sent }: { sent: Extract<LoginState, { step: "code" }> }) {
  const [state, action, pending] = useActionState(verifyCodeAction, sent);
  if (state.step !== "code") return <LoginForm />;
  return (
    <form action={action}>
      <Stack gap="md">
        <Text data-testid="code-sent">
          If {formatPhone(state.phone)} belongs to someone in this chest, a code is on its way.
        </Text>
        {state.devCode && (
          <Alert color="yellow" title="Test number" data-testid="dev-code-alert">
            No text was sent. Your code is{" "}
            <Text span fw={700} data-testid="dev-code">
              {state.devCode}
            </Text>
            .
          </Alert>
        )}
        <div>
          <Text size="sm" fw={500} mb={4}>
            Code
          </Text>
          <PinInput
            name="code"
            length={6}
            type="number"
            oneTimeCode
            autoFocus
            error={Boolean(state.error)}
            aria-label="Code"
            data-testid="code-input"
          />
          {state.error && (
            <Text c="red" size="sm" mt={6} role="alert" data-testid="code-error">
              {state.error}
            </Text>
          )}
        </div>
        <Group>
          <Button type="submit" loading={pending} data-testid="verify-code">
            Sign in
          </Button>
          <Anchor component="button" type="submit" name="intent" value="back" size="sm">
            Use a different number
          </Anchor>
        </Group>
      </Stack>
    </form>
  );
}
