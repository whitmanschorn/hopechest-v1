"use client";

import { useTransition } from "react";
import { NativeSelect } from "@mantine/core";
import { setKindAction } from "@/app/(app)/graph/actions";
import { KIND_HINTS, KIND_LABELS, PAGE_KINDS } from "@/lib/graph/vocabulary";

/** Says what kind of thing a wiki topic page is, which decides the facts that suit it. */
export function KindPicker({ nodeKey, kind }: { nodeKey: string; kind: string }) {
  const [busy, start] = useTransition();
  return (
    <NativeSelect
      aria-label="What kind of thing this page is about"
      size="xs"
      value={kind}
      disabled={busy}
      onChange={(event) => {
        const next = event.currentTarget.value;
        start(() => setKindAction(nodeKey, next));
      }}
      data={PAGE_KINDS.map((entry) => ({
        value: entry,
        label: `${KIND_LABELS[entry]}: ${KIND_HINTS[entry].toLowerCase()}`,
      }))}
      data-testid="page-kind"
    />
  );
}
