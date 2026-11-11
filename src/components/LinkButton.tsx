"use client";

import Link from "next/link";
import { Button, type ButtonProps } from "@mantine/core";

/**
 * A Mantine button that navigates. Server components cannot pass `Link` as a
 * `component` prop (functions don't cross to the client), so use this instead.
 */
export function LinkButton({
  href,
  ...props
}: ButtonProps & { href: string; "data-testid"?: string }) {
  return <Button component={Link} href={href} {...props} />;
}
