"use client";

import { Button, Group, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconCheck, IconCopy } from "@tabler/icons-react";

/** The invite link, with a button that copies it. The field is there for browsers that refuse to. */
export function CopyLink({ url, name }: { url: string; name: string }) {
  const clipboard = useClipboard({ timeout: 2500 });
  return (
    <Group gap="xs" wrap="nowrap" align="flex-end">
      <TextInput
        value={url}
        readOnly
        aria-label={`Invite link for ${name}`}
        onFocus={(event) => event.currentTarget.select()}
        style={{ flex: 1, minWidth: 0 }}
        size="xs"
        data-testid="invite-link"
      />
      <Button
        size="xs"
        variant={clipboard.copied ? "light" : "default"}
        leftSection={clipboard.copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        onClick={() => clipboard.copy(url)}
        data-testid="copy-invite-link"
      >
        {clipboard.copied ? "Copied" : "Copy link"}
      </Button>
    </Group>
  );
}
