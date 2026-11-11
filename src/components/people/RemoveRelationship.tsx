"use client";

import { useRef } from "react";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconX } from "@tabler/icons-react";
import { removeRelationshipAction } from "@/app/(app)/people/actions";

/** Removes the link between two people (not the people), after confirming. */
export function RemoveRelationship({
  relationshipId,
  slug,
  description,
}: {
  relationshipId: string;
  slug: string;
  /** e.g. "Lucille Bluth as a parent of Michael Bluth" */
  description: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={removeRelationshipAction}>
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <input type="hidden" name="slug" value={slug} />
      <Tooltip label="Remove this link">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Remove ${description}`}
          data-testid="remove-relationship"
          onClick={() =>
            modals.openConfirmModal({
              title: "Remove this link?",
              centered: true,
              children: (
                <Text fz="sm">
                  This removes {description}. Both people stay in the chest, and the change is kept
                  in their history.
                </Text>
              ),
              labels: { confirm: "Remove", cancel: "Keep" },
              confirmProps: { color: "red", "data-testid": "confirm-remove" } as never,
              onConfirm: () => form.current?.requestSubmit(),
            })
          }
        >
          <IconX size={16} />
        </ActionIcon>
      </Tooltip>
    </form>
  );
}
