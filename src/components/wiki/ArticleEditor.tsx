"use client";

import { useActionState, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { saveArticleAction, type ArticleFormState } from "@/app/(app)/wiki/actions";
import { LinkButton } from "@/components/LinkButton";
import type { LinkTarget } from "@/lib/wiki/markup";
import { ArticleBody } from "./ArticleBody";
import classes from "./Article.module.css";

/**
 * The editor for a page: the text, a preview drawn by the same code as the
 * saved page, and a line on what changed for the history.
 */
export function ArticleEditor({
  page,
  initial,
  base,
  targets,
  cancelHref,
}: {
  /** Which page; null to start a new topic. */
  page: { kind: "person" | "topic"; slug: string } | null;
  initial: { title: string; body: string };
  /** The revision editing started from; undefined when the page is new. */
  base?: string | null;
  targets: LinkTarget[];
  cancelHref: string;
}) {
  const ready = useMounted();
  const start: ArticleFormState = { ...initial, summary: "", errors: {} };
  const [state, action, pending] = useActionState(saveArticleAction, start);
  const [body, setBody] = useState(initial.body);
  const [view, setView] = useState("write");
  const fixedTitle = page?.kind === "person";

  return (
    <form action={action} data-testid="article-form" data-ready={ready}>
      {page && <input type="hidden" name="kind" value={page.kind} />}
      {page && <input type="hidden" name="slug" value={page.slug} />}
      {base !== undefined && <input type="hidden" name="base" value={base ?? ""} />}
      <Stack gap="md">
        {state.errors.base && (
          <Alert color="red" data-testid="article-conflict">
            {state.errors.base}
          </Alert>
        )}
        {!fixedTitle && (
          <TextInput
            name="title"
            label="Title"
            defaultValue={state.title}
            error={state.errors.title}
            required
            data-testid="article-title-input"
          />
        )}
        <SegmentedControl
          value={view}
          onChange={setView}
          data={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
          w="fit-content"
          data-testid="article-view"
        />
        {/* Kept in the form while previewing, so its text is still submitted. */}
        <div hidden={view !== "write"}>
          <Textarea
            name="body"
            aria-label="The text of the page"
            className={classes.editor}
            autosize
            minRows={14}
            maxRows={40}
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            error={state.errors.body}
            data-testid="article-body-input"
          />
          <Text c="dimmed" fz="xs" mt={6}>
            <b>## Heading</b> · <b>- list item</b> · <b>**bold**</b> · <b>*italic*</b> ·{" "}
            <b>&gt; quotation</b> · <b>[[Name of a person or page]]</b> links to it, and{" "}
            <b>[[lucille|Gangy]]</b> shows other words for the link.
          </Text>
        </div>
        {view === "preview" && (
          <Paper withBorder p="lg" radius="md" bg="var(--hc-surface)" data-testid="article-preview">
            {body.trim() ? (
              <ArticleBody source={body} targets={targets} canCreate />
            ) : (
              <Text c="dimmed">Nothing written yet.</Text>
            )}
          </Paper>
        )}
        <TextInput
          name="summary"
          label="What did you change?"
          description="Optional. Shown in the page’s history."
          placeholder="Added how they met"
          defaultValue={state.summary}
          maxLength={200}
          data-testid="article-summary-input"
        />
        <Group gap="sm">
          <Button type="submit" loading={pending} data-testid="save-article">
            Save
          </Button>
          <LinkButton href={cancelHref} variant="default">
            Cancel
          </LinkButton>
        </Group>
      </Stack>
    </form>
  );
}
