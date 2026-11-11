"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Anchor,
  Button,
  Group,
  Modal,
  NativeSelect,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconUserPlus } from "@tabler/icons-react";
import { addRelativeAction, type RelativeFormState } from "@/app/(app)/people/actions";

const ROLES = [
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "partner", label: "Partner" },
];
const KINDS: Record<string, string[]> = {
  parent: ["biological", "adoptive", "step", "foster", "legal"],
  child: ["biological", "adoptive", "step", "foster", "legal"],
  partner: ["married", "partnered"],
};
const ENDINGS = [
  { value: "", label: "Still together" },
  { value: "divorce", label: "Divorced" },
  { value: "separation", label: "Separated" },
  { value: "annulment", label: "Annulled" },
  { value: "death", label: "One of them died" },
  { value: "other", label: "Ended another way" },
];

/** Button and dialog for tying a person to a relative. */
export function AddRelative({
  slug,
  displayName,
  options,
}: {
  slug: string;
  displayName: string;
  /** Everyone else in the chest. */
  options: { value: string; label: string }[];
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [role, setRole] = useState("parent");
  const [state, action, pending] = useActionState(addRelativeAction, {} as RelativeFormState);

  return (
    <>
      <Button
        variant="default"
        leftSection={<IconUserPlus size={16} />}
        onClick={open}
        data-testid="add-relative"
      >
        Add a relative
      </Button>
      <Modal opened={opened} onClose={close} title={`Add a relative of ${displayName}`} centered>
        <form action={action} data-testid="relative-form">
          <input type="hidden" name="slug" value={slug} />
          <Stack gap="sm">
            {state.message && (
              <Alert color="red" data-testid="relative-error">
                {state.message}
              </Alert>
            )}
            <NativeSelect
              name="role"
              label="They are this person's"
              data={ROLES}
              value={role}
              onChange={(event) => setRole(event.currentTarget.value)}
              data-testid="relative-role"
            />
            <NativeSelect
              key={role}
              name="qualifier"
              label="Kind"
              data={KINDS[role]}
              data-testid="relative-qualifier"
            />
            {role === "partner" && <NativeSelect name="endReason" label="Now" data={ENDINGS} />}
            <Select
              name="otherSlug"
              label="Who"
              placeholder="Search the chest"
              data={options}
              searchable
              nothingFoundMessage="No one by that name"
              comboboxProps={{ withinPortal: false }}
              data-testid="relative-person"
            />
            <Text fz="sm" c="dimmed">
              Not in the chest yet?{" "}
              <Anchor
                component={Link}
                href={`/people/new?of=${slug}&as=${role}`}
                data-testid="relative-new"
              >
                Add them as a new person
              </Anchor>
              .
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} data-testid="save-relative">
                Add
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
