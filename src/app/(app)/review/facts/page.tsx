import type { Metadata } from "next";
import { Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { LinkButton } from "@/components/LinkButton";
import { ClaimCard } from "@/components/review/ClaimCard";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { ACTION_LABELS, describeArgs } from "@/lib/claims/actions";
import { requireActor } from "@/server/auth/session";
import { listClaims } from "@/server/claims/service";

export const metadata: Metadata = { title: "Proposed facts · Hopechest" };

const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const STATUSES = [
  { value: "proposed", label: "Waiting" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

export default async function FactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requireActor("write");
  const wanted = (await searchParams).status ?? "proposed";
  const status = STATUSES.some((entry) => entry.value === wanted) ? wanted : "proposed";
  const { claims, waiting } = await listClaims(actor, { status });

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="facts-title">
            Proposed facts
          </Title>
          <Text c="dimmed">
            Things read out of documents, or suggested by an assistant, that nobody has confirmed.
            Accepting one records it and keeps the link to where it came from.
          </Text>
        </div>
        <ReviewTabs current="facts" waitingFacts={waiting} />

        <Group gap={6}>
          {STATUSES.map((entry) => (
            <LinkButton
              key={entry.value}
              href={
                entry.value === "proposed" ? "/review/facts" : `/review/facts?status=${entry.value}`
              }
              size="compact-sm"
              variant={entry.value === status ? "filled" : "default"}
              data-testid={`facts-${entry.value}`}
            >
              {entry.label}
            </LinkButton>
          ))}
        </Group>

        {claims.length === 0 ? (
          <Paper withBorder p="lg" data-testid="facts-empty">
            <Text c="dimmed">
              {status === "proposed"
                ? "Nothing is waiting to be decided."
                : `Nothing ${status} yet.`}
            </Text>
          </Paper>
        ) : (
          <Stack gap="sm" data-testid="claim-list">
            {claims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={{
                  id: claim.id,
                  status: claim.status,
                  statement: claim.statement,
                  actionLabel: ACTION_LABELS[claim.action] ?? claim.action,
                  lines: describeArgs(claim.args),
                  quote: claim.quote,
                  source: claim.source && {
                    citation: claim.source.citation,
                    href: claim.source.documentId
                      ? `/documents/${claim.source.documentId}`
                      : claim.source.url,
                  },
                  proposedBy: claim.proposedBy,
                  proposedOn: day.format(claim.proposedAt),
                  reviewedBy: claim.reviewedBy,
                  reviewNote: claim.reviewNote,
                  appliedHref: claim.appliedHref,
                }}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
