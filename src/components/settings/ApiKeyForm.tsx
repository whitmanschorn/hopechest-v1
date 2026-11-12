"use client";

import { useActionState } from "react";
import { Alert, Button, Code, Group, NativeSelect, Stack, Text, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { createApiKeyAction, type ApiKeyFormState } from "@/app/(app)/settings/actions";

/** Makes an API key and shows it, once. */
export function ApiKeyForm({
  levels,
  origin,
}: {
  levels: { value: string; label: string }[];
  /** This site's address, for the example. */
  origin: string;
}) {
  const start: ApiKeyFormState = {
    input: { name: "", access: levels[0].value },
    errors: {},
    created: null,
  };
  const [state, action, pending] = useActionState(createApiKeyAction, start);
  const clipboard = useClipboard({ timeout: 2500 });
  const { created } = state;

  return (
    <Stack gap="md">
      {created && (
        <Alert color="green" title={`Key made: ${created.name}`} data-testid="new-api-key">
          <Stack gap="xs">
            <Text fz="sm">
              Copy it now. It is not shown again; if it is lost, revoke it and make another.
            </Text>
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                value={created.key}
                readOnly
                aria-label="The new API key"
                onFocus={(event) => event.currentTarget.select()}
                style={{ flex: 1, minWidth: 0 }}
                ff="monospace"
                data-testid="new-api-key-value"
              />
              <Button
                variant={clipboard.copied ? "light" : "default"}
                leftSection={clipboard.copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                onClick={() => clipboard.copy(created.key)}
                data-testid="copy-api-key"
              >
                {clipboard.copied ? "Copied" : "Copy"}
              </Button>
            </Group>
            <Text fz="sm">To try it:</Text>
            <Code block style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {`curl -H "Authorization: Bearer ${created.key}" ${origin}/api/v1`}
            </Code>
          </Stack>
        </Alert>
      )}
      <form action={action} key={JSON.stringify(state.input)} data-testid="api-key-form">
        <Stack gap="sm">
          <TextInput
            name="name"
            label="What is it for?"
            description="Such as “Claude on my laptop” or “Slide scanner”"
            defaultValue={state.input.name}
            error={state.errors.name}
            required
            data-testid="api-key-name"
          />
          <NativeSelect
            name="access"
            label="What may it do?"
            data={levels}
            defaultValue={state.input.access}
            error={state.errors.access}
            data-testid="api-key-access"
          />
          <div>
            <Button type="submit" loading={pending} data-testid="create-api-key">
              Make a key
            </Button>
          </div>
        </Stack>
      </form>
    </Stack>
  );
}
