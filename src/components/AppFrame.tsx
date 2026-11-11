"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLogout } from "@tabler/icons-react";
import { NAV } from "./nav";
import classes from "./AppFrame.module.css";

export interface FrameUser {
  /** Name if they have a profile, otherwise a masked phone number. */
  label: string;
  avatarUrl: string | null;
  role: string;
  /** Permissions this person holds, for hiding menu entries they cannot use. */
  permissions: readonly string[];
}

export function AppFrame({
  chestName,
  user,
  signOut,
  children,
}: {
  chestName: string;
  user: FrameUser;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [opened, { toggle, close }] = useDisclosure(false);
  const items = NAV.filter((item) => !item.needs || user.permissions.includes(item.needs));

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header className={classes.header}>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Menu"
              data-testid="nav-burger"
            />
            <UnstyledButton component={Link} href="/home" data-testid="chest-home-link">
              <Title order={3} component="span" data-testid="chest-title">
                {chestName}
              </Title>
            </UnstyledButton>
          </Group>

          <Menu position="bottom-end" width={220}>
            <Menu.Target>
              <UnstyledButton aria-label="Your account" data-testid="user-menu">
                {/* Initials only for a real name; a masked phone number gets the plain icon. */}
                <Avatar
                  src={user.avatarUrl}
                  name={/^\p{L}/u.test(user.label) ? user.label : undefined}
                  color="sepia"
                  radius="xl"
                />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                <Text size="sm" c="var(--mantine-color-text)" data-testid="signed-in-as">
                  {user.label}
                </Text>
                <Badge variant="light" size="xs" mt={4} data-testid="role-badge">
                  {user.role}
                </Badge>
              </Menu.Label>
              <Menu.Divider />
              <form action={signOut}>
                <Menu.Item
                  component="button"
                  type="submit"
                  leftSection={<IconLogout size={16} />}
                  data-testid="sign-out"
                >
                  Sign out
                </Menu.Item>
              </form>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" className={classes.navbar} data-testid="main-nav">
        {items.map((item) => (
          <NavLink
            key={item.href}
            component={Link}
            href={item.href}
            label={item.label}
            leftSection={<item.icon size={20} stroke={1.5} />}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            onClick={close}
            data-testid={`nav-${item.href.slice(1)}`}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
