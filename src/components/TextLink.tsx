"use client";

import Link from "next/link";
import { Anchor, type AnchorProps } from "@mantine/core";

/**
 * An in-text link to another page. Server components cannot pass `Link` as a
 * `component` prop, so they use this (see also LinkButton).
 */
export function TextLink({
  href,
  ...props
}: AnchorProps & { href: string; children: React.ReactNode; "data-testid"?: string }) {
  return <Anchor component={Link} href={href} {...props} />;
}
