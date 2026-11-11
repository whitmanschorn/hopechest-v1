"use client";

import { useActionState } from "react";
import { Alert, Button, Group, PinInput, Stack, Text } from "@mantine/core";
import { joinSendCodeAction, joinVerifyAction, type JoinState } from "./actions";

const START: JoinState = { step: "start" };

function Gone() {
  return (
    <Alert color="yellow" data-testid="join-gone">
      This invitation is no longer open. Ask whoever sent it for a new link.
    </Alert>
  );
}

export function JoinForm({ token, phoneHint }: { token: string; phoneHint: string }) {
  const [sent, send, sending] = useActionState(joinSendCodeAction.bind(null, token), START);
  if (sent.step === "gone") return <Gone />;
  if (sent.step === "code")
    return <CodeStep key={sent.devCode ?? ""} token={token} sent={sent} phoneHint={phoneHint} />;
  return (
    <form action={send}>
      <Stack gap="md">
        <Text>
          To make sure it&apos;s you, we&apos;ll text a six-digit code to your phone ending{" "}
          <Text span fw={700} data-testid="join-phone-hint">
            {phoneHint.slice(-4)}
          </Text>
          . There is no password to choose or remember.
        </Text>
        {sent.error && (
          <Alert color="red" data-testid="join-error">
            {sent.error}
          </Alert>
        )}
        <Button type="submit" loading={sending} data-testid="join-send-code">
          Text me a code
        </Button>
      </Stack>
    </form>
  );
}

function CodeStep({
  token,
  sent,
  phoneHint,
}: {
  token: string;
  sent: Extract<JoinState, { step: "code" }>;
  phoneHint: string;
}) {
  const [state, action, pending] = useActionState(
    joinVerifyAction.bind(null, token),
    sent as JoinState,
  );
  if (state.step === "gone") return <Gone />;
  if (state.step !== "code") return <JoinForm token={token} phoneHint={phoneHint} />;
  return (
    <form action={action}>
      <Stack gap="md">
        <Text data-testid="join-code-sent">
          A code is on its way to your phone ending {phoneHint.slice(-4)}.
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
            aria-label="Six-digit code"
            data-testid="code-input"
          />
          {state.error && (
            <Text c="red" size="sm" mt={6} data-testid="join-error">
              {state.error}
            </Text>
          )}
        </div>
        <Group>
          <Button type="submit" loading={pending} data-testid="join-verify">
            Join
          </Button>
          <Button type="submit" name="intent" value="resend" variant="subtle" formNoValidate>
            Send a new code
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
