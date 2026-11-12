import type { Metadata } from "next";
import { headers } from "next/headers";
import { Badge, Button, Code, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { ApiKeyForm } from "@/components/settings/ApiKeyForm";
import { ACCESS_LEVELS, listApiKeys } from "@/server/apiKeys/service";
import { LinkButton } from "@/components/LinkButton";
import { requireActor } from "@/server/auth/session";
import { revokeApiKeyAction } from "./actions";

export const metadata: Metadata = { title: "Settings · Hopechest" };

const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function SettingsPage() {
  const actor = await requireActor("admin");
  const [keys, requestHeaders] = await Promise.all([listApiKeys(actor), headers()]);
  // The address programs will call, as the browser reached this site.
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${host}`;
  const levels = Object.entries(ACCESS_LEVELS).map(([value, level]) => ({
    value,
    label: level.label,
  }));

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1} data-testid="settings-title">
            Settings
          </Title>
          <Text c="dimmed">Only admins see this page.</Text>
        </div>

        <Stack gap="xs" component="section">
          <Title order={2} fz="h3">
            Vocabulary
          </Title>
          <Text c="dimmed" fz="sm">
            The kinds of fact that can be recorded: “worked at”, “lived at”, “godparent of”. You can
            add your family’s own.
          </Text>
          <div>
            <LinkButton href="/settings/vocabulary" variant="default" data-testid="open-vocabulary">
              See and add kinds of fact
            </LinkButton>
          </div>
        </Stack>

        <Stack gap="sm" component="section">
          <Title order={2} fz="h3">
            API keys
          </Title>
          <Text c="dimmed" fz="sm">
            A key lets a program read and change this chest without signing in: Claude in a
            terminal, the command-line tool, a script. Anyone holding a key can use it, so treat it
            like a password. The list of what a key can call is at <Code>{origin}/api/v1</Code>.
          </Text>
          <Paper p="md" radius="md" withBorder bg="var(--hc-surface)">
            <ApiKeyForm levels={levels} origin={origin} />
          </Paper>
        </Stack>

        <Stack gap="sm" component="section" data-testid="api-key-list">
          <Title order={2} fz="h3">
            Keys
          </Title>
          {keys.length === 0 && <Text c="dimmed">No keys yet.</Text>}
          {keys.map((key) => (
            <Paper
              key={key.id}
              p="md"
              radius="md"
              withBorder
              bg="var(--hc-surface)"
              data-testid="api-key"
              data-revoked={key.revokedAt !== null}
            >
              <Group justify="space-between" gap="sm" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <Text fw={600} data-testid="api-key-label">
                      {key.name}
                    </Text>
                    <Badge variant="light" tt="none" fw={500}>
                      {key.access}
                    </Badge>
                    {key.revokedAt && (
                      <Badge color="gray" variant="light" tt="none" fw={500}>
                        Revoked {DAY.format(key.revokedAt)}
                      </Badge>
                    )}
                  </Group>
                  <Text c="dimmed" fz="sm">
                    <Code>{key.prefix}…</Code> · Made {key.createdBy ? `by ${key.createdBy} ` : ""}
                    on {DAY.format(key.createdAt)} ·{" "}
                    {key.lastUsedAt ? `Last used ${DAY.format(key.lastUsedAt)}` : "Never used"}
                  </Text>
                </div>
                {!key.revokedAt && (
                  <form action={revokeApiKeyAction}>
                    <input type="hidden" name="id" value={key.id} />
                    <Button
                      type="submit"
                      variant="default"
                      size="compact-sm"
                      c="red"
                      data-testid="revoke-api-key"
                    >
                      Revoke
                    </Button>
                  </form>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
