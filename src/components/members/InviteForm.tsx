"use client";

import { useActionState } from "react";
import { Alert, Button, NativeSelect, Select, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { inviteAction, type InviteFormState } from "@/app/(app)/members/actions";
import { INVITE_ROLES, ROLE_LABELS } from "@/lib/invites/inviteForm";

const START: InviteFormState = {
  input: { name: "", person: "", email: "", phone: "", role: "CONTRIBUTOR" },
  errors: {},
};

/** Name, email and mobile number make a link. Nothing is sent: the admin sends the link. */
export function InviteForm({ people }: { people: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(inviteAction, START);
  const { input, errors } = state;
  return (
    <form action={action} key={JSON.stringify(input)} data-testid="invite-form">
      <Stack gap="sm">
        {state.message && <Alert color="red">{state.message}</Alert>}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            name="name"
            label="Name"
            description="As the family says it"
            defaultValue={input.name}
            error={errors.name}
            data-testid="invite-name"
          />
          <Select
            name="person"
            label="Or someone already in the chest"
            description="If they have a page here, pick it instead"
            placeholder="Search the chest"
            data={people}
            defaultValue={input.person || null}
            searchable
            clearable
            nothingFoundMessage="No one by that name"
            error={errors.person}
            data-testid="invite-person"
          />
          <TextInput
            name="email"
            type="email"
            label="Email"
            description="So you know where to reach them. Not used to sign in"
            defaultValue={input.email}
            error={errors.email}
            data-testid="invite-email"
          />
          <TextInput
            name="phone"
            type="tel"
            label="Mobile number"
            description="Their sign-in code is texted here"
            placeholder="(555) 555-0123"
            defaultValue={input.phone}
            error={errors.phone}
            required
            data-testid="invite-phone"
          />
          <NativeSelect
            name="role"
            label="They can"
            defaultValue={input.role}
            error={errors.role}
            data={INVITE_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
            data-testid="invite-role"
          />
        </SimpleGrid>
        <div>
          <Button type="submit" loading={pending} data-testid="invite-submit">
            Make an invite link
          </Button>
        </div>
      </Stack>
    </form>
  );
}
