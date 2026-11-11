import {
  IconHome,
  IconMap,
  IconMapPin,
  IconPhoto,
  IconTimeline,
  IconUserShield,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
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
export const NAV: readonly NavItem[] = [
  { href: "/home", label: "Home", icon: IconHome },
  { href: "/people", label: "People", icon: IconUsers },
  { href: "/photos", label: "Photos", icon: IconPhoto },
  { href: "/timeline", label: "Timeline", icon: IconTimeline },
  { href: "/places", label: "Places", icon: IconMapPin },
  { href: "/map", label: "Map", icon: IconMap },
  { href: "/members", label: "Members", icon: IconUserShield, needs: "admin" },
];
