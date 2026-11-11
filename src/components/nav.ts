import { IconHome, type Icon } from "@tabler/icons-react";
import type { Permission } from "@/server/actor";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  /** Hidden from people without this permission. Pages still enforce it themselves. */
  needs?: Permission;
}

/**
 * The main navigation. A feature adds its entry here in the same pull request
 * that adds its page, so the menu never links to something that isn't built.
 */
export const NAV: readonly NavItem[] = [{ href: "/home", label: "Home", icon: IconHome }];
