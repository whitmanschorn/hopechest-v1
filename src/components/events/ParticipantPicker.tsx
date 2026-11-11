"use client";

import { useState } from "react";
import { Group, MultiSelect, NativeSelect, Stack, Text } from "@mantine/core";
import { EVENT_ROLES, ROLE_LABELS, type ParticipantInput } from "@/lib/events/eventEdit";

const ROLE_OPTIONS = EVENT_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/**
 * Picks who took part in an event and what part each played. Submits one
 * `participant` form value per person, written "role:person-slug".
 */
export function ParticipantPicker({
  people,
  initial,
  error,
}: {
  /** Everyone in the chest: slug and name. */
  people: { value: string; label: string }[];
  initial: ParticipantInput[];
  error?: string;
}) {
  const [chosen, setChosen] = useState<ParticipantInput[]>(initial);
  const nameOf = (slug: string) => people.find((person) => person.value === slug)?.label ?? slug;

  return (
    <Stack gap="xs">
      <MultiSelect
        label="People"
        description="The subject is who the event is about: the person born, the two who married."
        placeholder="Search the chest"
        data={people}
        value={chosen.map((participant) => participant.person)}
        onChange={(slugs) =>
          setChosen(
            slugs.map(
              (slug) =>
                chosen.find((participant) => participant.person === slug) ?? {
                  person: slug,
                  role: "subject",
                },
            ),
          )
        }
        searchable
        clearable
        hidePickedOptions
        nothingFoundMessage="No one by that name"
        error={error}
        data-testid="event-people"
      />
      {chosen.map((participant) => (
        <Group
          key={participant.person}
          gap="sm"
          wrap="nowrap"
          justify="space-between"
          data-testid={`participant-${participant.person}`}
        >
          <input
            type="hidden"
            name="participant"
            value={`${participant.role}:${participant.person}`}
          />
          <Text fz="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {nameOf(participant.person)}
          </Text>
          <NativeSelect
            aria-label={`Part played by ${nameOf(participant.person)}`}
            data={ROLE_OPTIONS}
            value={participant.role}
            onChange={(event) => {
              const role = event.currentTarget.value;
              setChosen(
                chosen.map((other) =>
                  other.person === participant.person ? { ...other, role } : other,
                ),
              );
            }}
            size="xs"
            w={150}
            style={{ flexShrink: 0 }}
            data-testid="participant-role"
          />
        </Group>
      ))}
    </Stack>
  );
}
