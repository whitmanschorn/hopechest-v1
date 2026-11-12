import type { Metadata } from "next";
import {
  Badge,
  Container,
  Paper,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { PredicateForm } from "@/components/graph/PredicateForm";
import { GROUP_LABELS, KIND_LABELS, type NodeKind } from "@/lib/graph/vocabulary";
import { requireActor } from "@/server/auth/session";
import { listPredicates } from "@/server/graph/service";

export const metadata: Metadata = { title: "Vocabulary · Hopechest" };

const kinds = (list: readonly NodeKind[]) =>
  list.length === 0 ? "anything" : list.map((kind) => KIND_LABELS[kind].toLowerCase()).join(", ");

export default async function VocabularyPage() {
  const actor = await requireActor("admin");
  const predicates = await listPredicates(actor);
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <div>
          <LinkButton
            href="/settings"
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            ml={-8}
          >
            Settings
          </LinkButton>
          <Title order={1} data-testid="vocabulary-title">
            Vocabulary
          </Title>
          <Text c="dimmed">
            Every kind of fact this chest can hold. The ones marked “kept strictly” (parents,
            partners, birth, death, events) have their own forms, because working out who is whose
            grandmother depends on them.
          </Text>
        </div>

        <Stack gap="sm" component="section">
          <Title order={2} fz="h3">
            Add your own
          </Title>
          <Paper p="md" radius="md" withBorder bg="var(--hc-surface)">
            <PredicateForm />
          </Paper>
        </Stack>

        <Table data-testid="predicate-table" verticalSpacing="xs">
          <TableThead>
            <TableTr>
              <TableTh>Reads</TableTh>
              <TableTh>The other way</TableTh>
              <TableTh>Said about</TableTh>
              <TableTh>Points at</TableTh>
              <TableTh />
            </TableTr>
          </TableThead>
          <TableTbody>
            {predicates.map((def) => (
              <TableTr key={def.key} data-testid="predicate-row">
                <TableTd>
                  <Text fw={600}>{def.label}</Text>
                  <Text fz="xs" c="dimmed">
                    {def.description ?? GROUP_LABELS[def.group]}
                  </Text>
                </TableTd>
                <TableTd>{def.symmetric ? "the same" : (def.inverse ?? "")}</TableTd>
                <TableTd>{kinds(def.subjects)}</TableTd>
                <TableTd>
                  {def.value === "entity"
                    ? kinds(def.objects)
                    : def.value === "text"
                      ? "a few words"
                      : `a ${def.value}`}
                </TableTd>
                <TableTd>
                  {def.core && (
                    <Badge variant="light" color="gray" tt="none">
                      Kept strictly
                    </Badge>
                  )}
                  {def.custom && (
                    <Badge variant="light" tt="none">
                      Yours
                    </Badge>
                  )}
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Stack>
    </Container>
  );
}
