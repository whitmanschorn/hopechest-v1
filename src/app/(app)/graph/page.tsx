import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { LinkButton } from "@/components/LinkButton";
import { TextLink } from "@/components/TextLink";
import { FactsPanel } from "@/components/graph/FactsPanel";
import { CANVAS, layoutGraph, shortName } from "@/lib/graph/layout";
import { KIND_LABELS, type NodeKind } from "@/lib/graph/vocabulary";
import { requireActor } from "@/server/auth/session";
import { findPath, getNeighbourhood, searchNodes } from "@/server/graph/service";
import classes from "@/components/graph/Graph.module.css";

export const metadata: Metadata = { title: "Graph · Hopechest" };

const COLORS: Record<NodeKind, string> = {
  person: "var(--mantine-color-blue-6)",
  place: "var(--mantine-color-green-7)",
  event: "var(--mantine-color-gray-6)",
  topic: "var(--mantine-color-yellow-7)",
  organization: "var(--mantine-color-violet-6)",
  group: "var(--mantine-color-pink-6)",
  thing: "var(--mantine-color-orange-7)",
  animal: "var(--mantine-color-teal-6)",
};

type Query = { center?: string; depth?: string; events?: string; q?: string; to?: string };

const address = (query: Query) => {
  const params = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return `/graph?${params}`;
};

export default async function GraphPage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor("read");
  const query = await searchParams;
  const depth = query.depth === "2" ? 2 : 1;
  const events = query.events === "yes";
  const q = (query.q ?? "").trim();
  const [around, matches, path] = await Promise.all([
    query.center ? getNeighbourhood(actor, query.center, { depth, events }) : null,
    q ? searchNodes(actor, { q, limit: 15 }) : [],
    query.center && query.to ? findPath(actor, query.center, query.to) : null,
  ]);
  const placed = around
    ? layoutGraph(
        around.center.key,
        around.nodes.map((node) => node.key),
        around.edges,
      )
    : [];
  const spot = new Map(placed.map((entry) => [entry.key, entry]));
  const nameOf = new Map((around?.nodes ?? []).map((node) => [node.key, node.name]));
  const view = { center: query.center, depth: String(depth), events: events ? "yes" : undefined };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="graph-title">
            Graph
          </Title>
          <Text c="dimmed">
            Everyone and everything in the chest, and how they are connected: family, work, homes,
            the things they owned.
          </Text>
        </div>

        <form action="/graph" method="get" role="search">
          {query.center && <input type="hidden" name="center" value={query.center} />}
          <Group gap="sm" align="flex-end">
            <TextInput
              name="q"
              aria-label="Find someone or something"
              placeholder="Find a person, place, company, thing…"
              defaultValue={q}
              style={{ flex: 1 }}
              data-testid="graph-search"
            />
            <Button type="submit" variant="default" data-testid="graph-search-go">
              Find
            </Button>
          </Group>
        </form>
        {q && (
          <Stack gap={4} data-testid="graph-matches">
            {matches.length === 0 && <Text c="dimmed">Nothing by that name.</Text>}
            {matches.map((node) => (
              <Group key={node.key} gap="sm">
                <TextLink href={address({ center: node.key })} fw={600} data-testid="graph-match">
                  {node.name}
                </TextLink>
                <Text c="dimmed" fz="sm">
                  {KIND_LABELS[node.kind]}
                </Text>
                {around && node.key !== around.center.key && (
                  <TextLink
                    href={address({ ...view, to: node.key })}
                    fz="sm"
                    data-testid="graph-connect"
                  >
                    How is this connected to {around.center.name}?
                  </TextLink>
                )}
              </Group>
            ))}
          </Stack>
        )}

        {!around && !q && (
          <Text c="dimmed" data-testid="graph-start">
            Find someone or something to start from. Every page also has a “See in the graph” link.
          </Text>
        )}
        {query.center && !around && <Text c="dimmed">There is nothing with that address.</Text>}

        {path && (
          <Paper withBorder p="md" radius="md" data-testid="graph-path">
            <Text fw={600} mb={6}>
              {path.from.name} and {path.to.name}
            </Text>
            {path.steps === null ? (
              <Text c="dimmed">Nothing recorded connects them.</Text>
            ) : (
              <div className={classes.step}>
                <b>{path.from.name}</b>
                {path.steps.map((step, index) => (
                  <span key={index} data-testid="graph-path-step">
                    <Text span c="dimmed">
                      {step.label}
                    </Text>{" "}
                    <TextLink href={address({ center: step.to.key })} fw={600}>
                      {step.to.name}
                    </TextLink>
                  </span>
                ))}
              </div>
            )}
          </Paper>
        )}

        {around && (
          <>
            <Group justify="space-between" align="flex-end">
              <div>
                <Title order={2} fz="h3" data-testid="graph-center">
                  {around.center.name}
                </Title>
                <Text c="dimmed" fz="sm">
                  {KIND_LABELS[around.center.kind]}
                  {around.center.href && (
                    <>
                      {" · "}
                      <TextLink href={around.center.href} inherit data-testid="graph-open-page">
                        Open their page
                      </TextLink>
                    </>
                  )}
                </Text>
              </div>
              <Group gap={6}>
                <LinkButton
                  href={address({ ...view, depth: depth === 1 ? "2" : "1" })}
                  size="compact-sm"
                  variant="default"
                  data-testid="graph-depth"
                >
                  {depth === 1 ? "Show one step further" : "Show less"}
                </LinkButton>
                <LinkButton
                  href={address({ ...view, events: events ? undefined : "yes" })}
                  size="compact-sm"
                  variant="default"
                  data-testid="graph-events"
                >
                  {events ? "Hide events" : "Show events"}
                </LinkButton>
              </Group>
            </Group>

            <svg
              viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
              className={classes.canvas}
              role="img"
              aria-label={`${around.center.name} and what is connected to it`}
              data-testid="graph-canvas"
            >
              {around.edges.map((edge, index) => {
                const a = spot.get(edge.from)!;
                const b = spot.get(edge.to)!;
                return (
                  <g key={index} data-testid="graph-edge">
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className={classes.edge}
                      data-core={edge.core}
                    />
                    <title>{`${nameOf.get(edge.from)} ${edge.label} ${nameOf.get(edge.to)}`}</title>
                    {/* Beyond the first ring the labels would pile up; they are there on hover. */}
                    {(depth === 1 || a.ring === 0 || b.ring === 0) && (
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 3}
                        className={classes.edgeLabel}
                        data-testid="graph-edge-label"
                      >
                        {a.ring === 0 || b.ring !== 0 ? edge.label : edge.inverse}
                      </text>
                    )}
                  </g>
                );
              })}
              {around.nodes.map((node) => {
                const at = spot.get(node.key)!;
                return (
                  <Link
                    key={node.key}
                    href={address({ ...view, center: node.key })}
                    className={classes.node}
                    data-center={at.ring === 0}
                    data-testid="graph-node"
                  >
                    <title>{`${node.name} (${KIND_LABELS[node.kind]})`}</title>
                    {/* So the whole of the dot and its name can be pressed, not just the ink. */}
                    <rect x={at.x - 62} y={at.y - 15} width={124} height={50} fill="transparent" />
                    <circle
                      cx={at.x}
                      cy={at.y}
                      r={at.ring === 0 ? 13 : 9}
                      fill={COLORS[node.kind]}
                    />
                    <text x={at.x} y={at.y + (at.ring === 0 ? 30 : 24)}>
                      {shortName(node.name)}
                    </text>
                  </Link>
                );
              })}
            </svg>
            <Group gap="md" data-testid="graph-legend">
              {[...new Set(around.nodes.map((node) => node.kind))].map((kind) => (
                <Group key={kind} gap={6}>
                  <svg width="12" height="12" aria-hidden>
                    <circle cx="6" cy="6" r="6" fill={COLORS[kind]} />
                  </svg>
                  <Text fz="sm">{KIND_LABELS[kind]}</Text>
                </Group>
              ))}
              {around.truncated && (
                <Text fz="sm" c="dimmed">
                  There is more than fits here.
                </Text>
              )}
            </Group>

            <Stack gap="xs">
              <Title order={2} fz="h3">
                Everything recorded about {around.center.name}
              </Title>
              <FactsPanel actor={actor} nodeKey={around.center.key} core />
            </Stack>
          </>
        )}
      </Stack>
    </Container>
  );
}
