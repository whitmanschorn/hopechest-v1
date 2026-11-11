"use client";

import { useRef, type ReactNode } from "react";
import { Button, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconTrash } from "@tabler/icons-react";

/** A delete button that asks first, then submits `fields` to a server action. */
export function ConfirmDelete({
  action,
  fields,
  title,
  children,
  "data-testid": testId,
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  /** The question: "Delete this event?" */
  title: string;
  /** What deleting will and will not do. */
  children: ReactNode;
  "data-testid"?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        variant="default"
        c="red"
        leftSection={<IconTrash size={16} />}
        data-testid={testId}
        onClick={() =>
          modals.openConfirmModal({
            title,
            centered: true,
            children: <Text fz="sm">{children}</Text>,
            labels: { confirm: "Delete", cancel: "Keep" },
            confirmProps: { color: "red", "data-testid": "confirm-delete" } as never,
            onConfirm: () => form.current?.requestSubmit(),
          })
        }
      >
        Delete
      </Button>
    </form>
  );
}
