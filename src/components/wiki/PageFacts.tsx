"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconSparkles } from "@tabler/icons-react";
import { suggestFactsAction } from "@/app/(app)/wiki/actions";
import { ClaimCard, type ClaimCardData } from "@/components/review/ClaimCard";

/**
 * Under a person's story: facts read out of it that could be recorded, each
 * to accept or reject, and a button to read the page again.
 */
export function PageFacts({
  slug,
  claims,
  justSaved,
}: {
  slug: string;
  claims: ClaimCardData[];
  /** True right after a save, while the page is being read in the background. */
  justSaved: boolean;
}) {
  const ready = useMounted();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [reading, setReading] = useState(justSaved);

  // The page is read after a save without holding the save up, so look again
  // shortly. Only while nothing has arrived: once suggestions are showing, a
  // late refresh could land on top of someone's Accept and show the page as it
  // was before.
  const waiting = justSaved && reading && claims.length === 0;
  useEffect(() => {
    if (!waiting) return;
    const timers = [3000, 7000, 13000, 21000].map((wait, index, all) =>
      setTimeout(() => {
        router.refresh();
        if (index === all.length - 1) setReading(false);
      }, wait),
    );
    return () => timers.forEach(clearTimeout);
  }, [waiting, router]);

  return (
    <Stack gap="sm" mt="md" data-testid="page-facts" data-ready={ready}>
      {claims.length > 0 && (
        <>
          <Text fw={600} data-testid="page-facts-title">
            From this page, not yet in the record
          </Text>
          {claims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </>
      )}
      {result && (
        <Alert color={result.ok ? "blue" : "red"} data-testid="page-facts-result">
          {result.message}
        </Alert>
      )}
      <Group gap="sm">
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={<IconSparkles size={14} />}
          loading={busy}
          onClick={() =>
            start(async () => {
              setReading(false);
              setResult(await suggestFactsAction(slug));
            })
          }
          data-testid="page-facts-read"
        >
          Look for facts in this page
        </Button>
        {waiting && !result && (
          <Text fz="sm" c="dimmed" data-testid="page-facts-reading">
            Reading what you wrote for dates and events to record…
          </Text>
        )}
      </Group>
    </Stack>
  );
}
