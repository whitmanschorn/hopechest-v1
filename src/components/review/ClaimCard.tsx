"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Blockquote,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconCheck, IconX } from "@tabler/icons-react";
import { acceptClaimAction, rejectClaimAction } from "@/app/(app)/review/facts/actions";
import { TextLink } from "@/components/TextLink";

export interface ClaimCardData {
  id: string;
  status: "proposed" | "accepted" | "rejected";
  statement: string;
  actionLabel: string;
  lines: { label: string; value: string }[];
  quote: string | null;
  source: { citation: string; href: string | null } | null;
  proposedBy: string;
  proposedOn: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  appliedHref: string | null;
}

/** One proposed fact: what it says, where it came from, what accepting would do. */
export function ClaimCard({ claim }: { claim: ClaimCardData }) {
  const ready = useMounted();
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const decide = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await action();
      setProblem(result.ok ? null : result.message);
    });

  return (
    <Paper withBorder p="md" radius="md" data-testid="claim-card" data-ready={ready}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text fw={600} data-testid="claim-statement">
            {claim.statement}
          </Text>
          <Badge variant="light" tt="none" fw={500} style={{ flex: "none" }}>
            {claim.actionLabel}
          </Badge>
        </Group>

        {claim.lines.length > 0 && (
          <div data-testid="claim-args">
            {claim.lines.map((line) => (
              <Text key={line.label} fz="sm">
                <Text span c="dimmed" inherit>
                  {line.label}:
                </Text>{" "}
                {line.value}
              </Text>
            ))}
          </div>
        )}

        {claim.quote && (
          <Blockquote p="sm" fz="sm" data-testid="claim-quote">
            {claim.quote}
          </Blockquote>
        )}

        <Text fz="sm" c="dimmed" data-testid="claim-origin">
          {claim.source ? (
            <>
              From{" "}
              {claim.source.href ? (
                <TextLink href={claim.source.href} inherit data-testid="claim-source">
                  {claim.source.citation}
                </TextLink>
              ) : (
                claim.source.citation
              )}
              {" · "}
            </>
          ) : (
            "No source given · "
          )}
          proposed by {claim.proposedBy}, {claim.proposedOn}
          {claim.status !== "proposed" && claim.reviewedBy
            ? ` · ${claim.status} by ${claim.reviewedBy}`
            : ""}
          {claim.reviewNote ? ` · “${claim.reviewNote}”` : ""}
        </Text>

        {problem && (
          <Alert color="red" data-testid="claim-problem">
            {problem}
          </Alert>
        )}

        {claim.status === "proposed" && !rejecting && (
          <Group gap="sm">
            <Button
              size="xs"
              leftSection={<IconCheck size={14} />}
              loading={busy}
              onClick={() => decide(() => acceptClaimAction(claim.id))}
              data-testid="claim-accept"
            >
              Accept
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconX size={14} />}
              disabled={busy}
              onClick={() => setRejecting(true)}
              data-testid="claim-reject"
            >
              Reject
            </Button>
          </Group>
        )}
        {claim.status === "proposed" && rejecting && (
          <Group gap="sm" align="flex-end">
            <TextInput
              label="Why? (optional)"
              size="xs"
              style={{ flex: 1 }}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              data-testid="claim-reject-note"
            />
            <Button
              size="xs"
              color="red"
              loading={busy}
              onClick={() => decide(() => rejectClaimAction(claim.id, note))}
              data-testid="claim-reject-confirm"
            >
              Reject
            </Button>
            <Button size="xs" variant="default" disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </Group>
        )}
        {claim.status === "accepted" && claim.appliedHref && (
          <TextLink href={claim.appliedHref} fz="sm" data-testid="claim-applied">
            See what it recorded
          </TextLink>
        )}
      </Stack>
    </Paper>
  );
}
