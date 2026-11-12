"use client";

import { useState, useTransition } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  NativeSelect,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconDots, IconPlus } from "@tabler/icons-react";
import {
  addFactAction,
  createPageNodeAction,
  rankFactAction,
  removeFactAction,
  searchNodesAction,
} from "@/app/(app)/graph/actions";
import { GROUP_LABELS, KIND_LABELS, PAGE_KINDS, type PredicateDef } from "@/lib/graph/vocabulary";
import type { FactErrors, NodeRef } from "@/server/graph/service";

/** The little menu on a fact: which account the family goes by, or remove it. */
export function FactMenu({ id, rank }: { id: string; rank: string }) {
  const [busy, start] = useTransition();
  const set = (next: string) => start(() => rankFactAction(id, next));
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          loading={busy}
          aria-label="Change or remove this fact"
          data-testid="fact-menu"
        >
          <IconDots size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>When accounts differ</Menu.Label>
        <Menu.Item
          disabled={rank === "preferred"}
          onClick={() => set("preferred")}
          data-testid="fact-prefer"
        >
          This is the one we go by
        </Menu.Item>
        <Menu.Item disabled={rank === "normal"} onClick={() => set("normal")}>
          One account among others
        </Menu.Item>
        <Menu.Item
          disabled={rank === "deprecated"}
          onClick={() => set("deprecated")}
          data-testid="fact-deprecate"
        >
          Known to be wrong, keep for the record
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          onClick={() => start(() => removeFactAction(id))}
          data-testid="fact-remove"
        >
          Remove
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * States a new fact about a node. The kind of fact decides the rest of the
 * form: a link asks for something to point at (found by name, or made on the
 * spot), a value asks for words, a date or a number.
 */
export function AddFact({ subject, predicates }: { subject: string; predicates: PredicateDef[] }) {
  const ready = useMounted();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<NodeRef[] | null>(null);
  const [object, setObject] = useState<NodeRef | null>(null);
  const [newKind, setNewKind] = useState<string>("organization");
  const [fields, setFields] = useState({ value: "", from: "", until: "", note: "" });
  const [errors, setErrors] = useState<FactErrors & { create?: string }>({});
  const [busy, start] = useTransition();
  const def = predicates.find((entry) => entry.key === key);
  const makeable = PAGE_KINDS.filter(
    (kind) => def && (def.objects.length === 0 || def.objects.includes(kind)),
  );

  const reset = () => {
    setKey("");
    setSearch("");
    setFound(null);
    setObject(null);
    setFields({ value: "", from: "", until: "", note: "" });
    setErrors({});
  };
  const look = (words: string) => {
    setSearch(words);
    setObject(null);
    if (!def || words.trim().length < 2) return setFound(null);
    start(async () => setFound(await searchNodesAction(words, [...def.objects])));
  };
  const save = () =>
    start(async () => {
      const result = await addFactAction({
        subject,
        predicate: key,
        object: object?.key,
        value: fields.value,
        from: fields.from,
        until: fields.until,
        note: fields.note,
      });
      if (!result.ok) return setErrors(result.errors);
      reset();
      setOpen(false);
    });
  const field = (name: keyof typeof fields, label: string, placeholder?: string) => (
    <TextInput
      label={label}
      placeholder={placeholder}
      size="xs"
      value={fields[name]}
      onChange={(event) => setFields({ ...fields, [name]: event.currentTarget.value })}
      error={errors[name]}
      data-testid={`fact-${name}`}
    />
  );

  if (!open) {
    return (
      <div data-testid="add-fact" data-ready={ready}>
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconPlus size={14} />}
          onClick={() => setOpen(true)}
          data-testid="add-fact-open"
        >
          Add a fact
        </Button>
      </div>
    );
  }
  return (
    <Paper withBorder p="md" radius="md" data-testid="add-fact" data-ready={ready}>
      <Stack gap="sm">
        <NativeSelect
          label="What kind of fact?"
          size="xs"
          value={key}
          onChange={(event) => {
            reset();
            setKey(event.currentTarget.value);
          }}
          error={errors.predicate ?? errors.subject}
          data-testid="fact-predicate"
        >
          <option value="">Choose…</option>
          {Object.entries(GROUP_LABELS).map(([group, label]) => {
            const inGroup = predicates.filter((entry) => entry.group === group);
            return inGroup.length === 0 ? null : (
              <optgroup key={group} label={label}>
                {inGroup.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </NativeSelect>
        {def?.description && (
          <Text fz="xs" c="dimmed">
            {def.description}
          </Text>
        )}

        {def?.value === "entity" && (
          <Stack gap={6}>
            <TextInput
              label={`${def.label.replace(/^./, (first) => first.toUpperCase())} whom or what?`}
              description="Type a name to find it."
              size="xs"
              value={object ? object.name : search}
              onChange={(event) => look(event.currentTarget.value)}
              error={errors.object}
              data-testid="fact-object-search"
            />
            {!object && found && (
              <Stack gap={4} data-testid="fact-object-results">
                {found.map((node) => (
                  <Button
                    key={node.key}
                    size="compact-xs"
                    variant="light"
                    justify="flex-start"
                    onClick={() => setObject(node)}
                    data-testid="fact-object-choice"
                  >
                    {node.name} · {KIND_LABELS[node.kind]}
                  </Button>
                ))}
                {makeable.length > 0 && search.trim() && (
                  <Group gap={6} align="flex-end">
                    <NativeSelect
                      aria-label="What kind of thing it is"
                      size="xs"
                      value={makeable.includes(newKind as never) ? newKind : makeable[0]}
                      onChange={(event) => setNewKind(event.currentTarget.value)}
                      data={makeable.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
                      data-testid="fact-new-kind"
                    />
                    <Button
                      size="compact-xs"
                      variant="default"
                      loading={busy}
                      onClick={() =>
                        start(async () => {
                          const kind = makeable.includes(newKind as never) ? newKind : makeable[0];
                          const made = await createPageNodeAction(search, kind);
                          if (made.ok) setObject(made.node);
                          else setErrors({ ...errors, create: made.message });
                        })
                      }
                      data-testid="fact-object-create"
                    >
                      Not listed: add “{search.trim()}”
                    </Button>
                  </Group>
                )}
                {errors.create && (
                  <Text fz="xs" c="red">
                    {errors.create}
                  </Text>
                )}
              </Stack>
            )}
          </Stack>
        )}
        {def &&
          def.value !== "entity" &&
          field(
            "value",
            def.label.replace(/^./, (first) => first.toUpperCase()),
            def.value === "date" ? "1974, June 1974, around 1974" : undefined,
          )}
        {def?.spans && (
          <Group grow align="flex-start">
            {field("from", "From (optional)", "1974")}
            {field("until", "Until (optional)", "1982")}
          </Group>
        )}
        {def && field("note", "A few words more (optional)", "as bookkeeper")}
        <Group gap="sm">
          <Button size="xs" loading={busy} disabled={!def} onClick={save} data-testid="fact-save">
            Add
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
