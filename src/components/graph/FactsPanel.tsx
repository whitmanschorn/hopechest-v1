import { Badge, Group, Stack, Text } from "@mantine/core";
import { TextLink } from "@/components/TextLink";
import { GROUP_LABELS, predicatesFor } from "@/lib/graph/vocabulary";
import type { Actor } from "@/server/actor";
import { getFacts, listPredicates, type Fact } from "@/server/graph/service";
import { AddFact, FactMenu } from "./FactEditor";
import classes from "./Graph.module.css";

const span = (fact: Fact) =>
  fact.from && fact.until
    ? `${fact.from} to ${fact.until}`
    : fact.from
      ? fact.other?.kind === "event" || fact.core
        ? fact.from
        : `from ${fact.from}`
      : fact.until
        ? `until ${fact.until}`
        : null;

/**
 * The facts the graph holds about a node, grouped, each with its dates, note
 * and source, and a way to add more. With `core` false, the facts the page
 * already shows in its own way (parents, events) are left out.
 */
export async function FactsPanel({
  actor,
  nodeKey,
  core,
}: {
  actor: Actor;
  nodeKey: string;
  core: boolean;
}) {
  const [found, predicates] = await Promise.all([getFacts(actor, nodeKey), listPredicates(actor)]);
  if (!found) return null;
  const facts = found.facts.filter((fact) => core || !fact.core);
  const groups = Object.entries(GROUP_LABELS)
    .map(([group, label]) => ({ label, facts: facts.filter((fact) => fact.group === group) }))
    .filter((group) => group.facts.length > 0);

  return (
    <Stack gap="md" data-testid="facts-panel">
      {groups.length === 0 && (
        <Text c="dimmed" data-testid="facts-empty">
          Nothing more is recorded yet: where they worked or lived, what they owned, who their
          friends were.
        </Text>
      )}
      {groups.map((group) => (
        <div key={group.label}>
          <Text fz="xs" fw={700} tt="uppercase" c="dimmed" mb={2}>
            {group.label}
          </Text>
          {group.facts.map((fact, index) => (
            <div
              key={fact.id ?? `${fact.predicate}-${index}`}
              className={classes.fact}
              data-rank={fact.rank}
              data-testid="fact"
            >
              <div>
                <Text span className={classes.said}>
                  <span className={classes.label}>{fact.label}</span>{" "}
                  {fact.other ? (
                    fact.other.href ? (
                      <TextLink href={fact.other.href} fw={600} data-testid="fact-link">
                        {fact.other.name}
                      </TextLink>
                    ) : (
                      <b>{fact.other.name}</b>
                    )
                  ) : (
                    <b>{fact.value}</b>
                  )}
                </Text>
                {[span(fact), fact.note].filter(Boolean).map((extra) => (
                  <Text span c="dimmed" key={extra}>
                    {" "}
                    · {extra}
                  </Text>
                ))}
                {fact.source && (
                  <Text fz="xs" c="dimmed" data-testid="fact-source">
                    {fact.quote ? `“${fact.quote}” ` : ""}
                    {fact.source.href ? (
                      <TextLink href={fact.source.href} inherit>
                        {fact.source.citation}
                      </TextLink>
                    ) : (
                      fact.source.citation
                    )}
                  </Text>
                )}
              </div>
              <Group gap={4} wrap="nowrap">
                {fact.rank === "preferred" && (
                  <Badge variant="light" size="xs" tt="none">
                    We go by this
                  </Badge>
                )}
                {fact.rank === "deprecated" && (
                  <Badge variant="light" color="gray" size="xs" tt="none">
                    Known to be wrong
                  </Badge>
                )}
                {fact.id && found.canEdit && <FactMenu id={fact.id} rank={fact.rank} />}
              </Group>
            </div>
          ))}
        </div>
      ))}
      {found.canEdit && (
        <AddFact subject={nodeKey} predicates={predicatesFor(found.node.kind, predicates)} />
      )}
    </Stack>
  );
}
