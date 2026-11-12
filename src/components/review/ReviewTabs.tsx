import { Group } from "@mantine/core";
import { LinkButton } from "@/components/LinkButton";

/** The two things that wait for review: arrivals (photos, documents) and proposed facts. */
export function ReviewTabs({
  current,
  waitingFacts,
}: {
  current: "arrivals" | "facts";
  waitingFacts: number;
}) {
  return (
    <Group gap={6} data-testid="review-tabs">
      <LinkButton
        href="/review"
        variant={current === "arrivals" ? "light" : "subtle"}
        data-testid="review-tab-arrivals"
      >
        Photos and documents
      </LinkButton>
      <LinkButton
        href="/review/facts"
        variant={current === "facts" ? "light" : "subtle"}
        data-testid="review-tab-facts"
      >
        Proposed facts{waitingFacts > 0 ? ` (${waitingFacts})` : ""}
      </LinkButton>
    </Group>
  );
}
