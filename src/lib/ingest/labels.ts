import type { BatchCounts } from "@/server/ingest/service";

const SOURCE_LABELS: Record<string, string> = {
  upload: "Upload",
  folder: "Folder",
  scan: "Scans",
  facebook_export: "Facebook export",
  facebook_capture: "Facebook",
};

export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;

/** The counts worth showing for a batch, in the order a reviewer cares about. */
export function countLabels(counts: BatchCounts): { key: keyof BatchCounts; label: string }[] {
  const entries: [keyof BatchCounts, string][] = [
    ["waiting", `${counts.waiting} waiting`],
    ["published", `${counts.published} published`],
    ["duplicates", `${counts.duplicates} already in the chest`],
    ["failed", `${counts.failed} failed`],
    ["discarded", `${counts.discarded} discarded`],
  ];
  return entries.filter(([key]) => counts[key] > 0).map(([key, label]) => ({ key, label }));
}
