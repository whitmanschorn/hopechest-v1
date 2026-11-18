import { Group } from "@mantine/core";
import { LinkButton } from "@/components/LinkButton";

/** The things that wait for review: arrivals (photos, documents), unnamed faces and proposed facts. */
export function ReviewTabs({
  current,
  waitingFacts,
  waitingFaces,
}: {
  current: "arrivals" | "faces" | "facts";
  waitingFacts: number;
  /** Left out where it is not known; the tab then shows no number. */
  waitingFaces?: number;
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
        href="/review/faces"
        variant={current === "faces" ? "light" : "subtle"}
        data-testid="review-tab-faces"
      >
        Who is this?{waitingFaces ? ` (${waitingFaces})` : ""}
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
