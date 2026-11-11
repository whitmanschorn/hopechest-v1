import type { Metadata } from "next";
import { headers } from "next/headers";
import { Badge, Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { CopyLink } from "@/components/members/CopyLink";
import { InviteForm } from "@/components/members/InviteForm";
import { TextLink } from "@/components/TextLink";
import { ROLE_LABELS, type InviteRole } from "@/lib/invites/inviteForm";
import { requireActor } from "@/server/auth/session";
import { listMembers } from "@/server/invites/service";
import { listPersonOptions } from "@/server/people/service";
import { renewInviteAction, revokeInviteAction } from "./actions";

export const metadata: Metadata = { title: "Members · Hopechest" };

const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const can = (role: string) => ROLE_LABELS[role as InviteRole] ?? role;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const actor = await requireActor("admin");
  const [{ members, invites }, people, requestHeaders, { invited }] = await Promise.all([
    listMembers(actor),
    listPersonOptions(actor),
    headers(),
    searchParams,
  ]);
  // The address people will actually open, as the browser reached this site.
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${host}`;
  const taken = new Set(members.map((member) => member.personSlug));

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1} data-testid="members-title">
            Members
          </Title>
          <Text c="dimmed">Who can sign in to this chest, and who has been invited.</Text>
        </div>

        <Stack gap="sm" component="section">
          <Title order={2} fz="h3">
            Invite someone
          </Title>
          <Text c="dimmed" fz="sm">
            This makes a link for you to send them yourself, by text or email. When they open it
            they confirm with a code texted to their phone.
          </Text>
          <Paper p="md" radius="md" withBorder bg="var(--hc-surface)">
            <InviteForm people={people.filter((person) => !taken.has(person.value))} />
          </Paper>
        </Stack>

        <Stack gap="sm" component="section" data-testid="invited-list">
          <Title order={2} fz="h3">
            Invited
          </Title>
          {invites.length === 0 && <Text c="dimmed">No one is waiting on an invite.</Text>}
          {invites.map((invite) => (
            <Paper
              key={invite.id}
              p="md"
              radius="md"
              withBorder
              bg="var(--hc-surface)"
              data-testid="invite-row"
              data-new={invite.id === invited}
              style={
                invite.id === invited
                  ? { borderColor: "var(--mantine-primary-color-filled)" }
                  : undefined
              }
            >
              <Stack gap="xs">
                <Group justify="space-between" gap="xs">
                  <Group gap="xs">
                    <TextLink
                      href={`/people/${invite.personSlug}`}
                      fw={600}
                      data-testid="invite-row-name"
                    >
                      {invite.name}
                    </TextLink>
                    {invite.state === "expired" ? (
                      <Badge color="red" variant="light" tt="none">
                        Link expired
                      </Badge>
                    ) : (
                      <Badge variant="light" tt="none">
                        Invited
                      </Badge>
                    )}
                  </Group>
                  <Group gap="xs">
                    {invite.state === "expired" && (
                      <form action={renewInviteAction}>
                        <input type="hidden" name="id" value={invite.id} />
                        <Button
                          type="submit"
                          size="compact-sm"
                          variant="default"
                          data-testid="renew-invite"
                        >
                          Renew for 30 days
                        </Button>
                      </form>
                    )}
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="id" value={invite.id} />
                      <Button
                        type="submit"
                        size="compact-sm"
                        variant="subtle"
                        color="red"
                        data-testid="revoke-invite"
                      >
                        Cancel invite
                      </Button>
                    </form>
                  </Group>
                </Group>
                <Text c="dimmed" fz="sm">
                  {[
                    invite.phone,
                    invite.email,
                    can(invite.role),
                    `link works until ${DAY.format(invite.expiresAt)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {invite.path && <CopyLink url={`${origin}${invite.path}`} name={invite.name} />}
              </Stack>
            </Paper>
          ))}
        </Stack>

        <Stack gap="sm" component="section" data-testid="member-list">
          <Title order={2} fz="h3">
            Members
          </Title>
          {members.map((member) => (
            <Paper
              key={member.id}
              p="md"
              radius="md"
              withBorder
              bg="var(--hc-surface)"
              data-testid="member-row"
            >
              <Group justify="space-between" gap="xs">
                {member.personSlug ? (
                  <TextLink href={`/people/${member.personSlug}`} fw={600}>
                    {member.name}
                  </TextLink>
                ) : (
                  <Text fw={600}>{member.name}</Text>
                )}
                <Text c="dimmed" fz="sm">
                  {member.lastSeenAt
                    ? `Last here ${DAY.format(member.lastSeenAt)}`
                    : "Has not signed in yet"}
                </Text>
              </Group>
              <Text c="dimmed" fz="sm">
                {[member.phone, member.email, can(member.role)].filter(Boolean).join(" · ")}
              </Text>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
