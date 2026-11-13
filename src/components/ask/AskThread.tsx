"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Alert, Anchor, Button, Group, Loader, Stack, Text, Textarea } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconSend } from "@tabler/icons-react";
import { answerPieces } from "@/lib/ask/cite";
import { MAX_QUESTION_LENGTH } from "@/lib/ask/prompt";
import type { Answer, Citation, Turn } from "@/server/ask/service";
import classes from "./AskThread.module.css";

const KIND: Record<Citation["type"], string> = {
  person: "person",
  event: "event",
  document: "document",
  place: "place",
  page: "wiki page",
  photo: "photo",
};

/** An answer's words, with each [n] a link to what it rests on, and the list of those below. */
export function AnswerBody({ text, citations }: { text: string; citations: Citation[] }) {
  const href = (number: number) => citations.find((entry) => entry.number === number)?.href;
  const line = (words: string, key: number) =>
    answerPieces(words).map((piece, index) =>
      piece.kind === "text" ? (
        piece.text
      ) : piece.kind === "bold" ? (
        <strong key={`${key}-${index}`}>{piece.text}</strong>
      ) : href(piece.number) ? (
        <Anchor
          component={Link}
          key={`${key}-${index}`}
          href={href(piece.number)!}
          className={classes.cite}
          aria-label={`Source ${piece.number}`}
        >
          [{piece.number}]
        </Anchor>
      ) : null,
    );
  // Blank lines part paragraphs; lines starting "- " are a list.
  const blocks = text.split(/\n{2,}/).map((block) => block.split("\n"));
  return (
    <div className={classes.answer} data-testid="ask-answer">
      {blocks.map((lines, at) =>
        lines.every((entry) => /^[-*] /.test(entry)) ? (
          <ul key={at}>
            {lines.map((entry, index) => (
              <li key={index}>{line(entry.slice(2), index)}</li>
            ))}
          </ul>
        ) : (
          <p key={at}>{line(lines.join(" "), at)}</p>
        ),
      )}
      {citations.length > 0 && (
        <ol className={classes.sources} data-testid="ask-sources">
          {citations.map((entry) => (
            <li key={entry.number}>
              <span>{entry.number}.</span>
              <span>
                <Anchor component={Link} href={entry.href} fz="sm" data-testid="ask-source">
                  {entry.label}
                </Anchor>{" "}
                <Text span c="dimmed" fz="sm">
                  ({KIND[entry.type]})
                </Text>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface Waiting {
  question: string;
  steps: string[];
}

/** A conversation with the chest: questions, the lookups as they happen, answers with sources. */
export function AskThread({
  conversationId,
  turns,
  examples,
}: {
  conversationId: string | null;
  turns: Turn[];
  examples: string[];
}) {
  const ready = useMounted();
  const [thread, setThread] = useState(turns);
  const [conversation, setConversation] = useState(conversationId);
  const [question, setQuestion] = useState("");
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const scroll = () =>
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: "nearest" }));

  const send = async (words: string) => {
    const asked = words.trim();
    if (!asked || waiting) return;
    setProblem(null);
    setQuestion("");
    setWaiting({ question: asked, steps: [] });
    scroll();
    let answer: Answer | null = null;
    let error = "The answer did not arrive. Check your connection and try again.";
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked, conversation: conversation ?? undefined }),
      });
      if (response.status === 401) error = "You have been signed out. Sign in and ask again.";
      const reader = response.ok ? response.body?.getReader() : null;
      const decoder = new TextDecoder();
      let unread = "";
      while (reader) {
        const { done, value } = await reader.read();
        unread += decoder.decode(value, { stream: !done });
        const lines = unread.split("\n");
        unread = lines.pop() ?? "";
        for (const text of lines.filter(Boolean)) {
          const line = JSON.parse(text) as { step?: string; answer?: Answer; error?: string };
          if (line.step) {
            const step = line.step;
            setWaiting((current) => current && { ...current, steps: [...current.steps, step] });
            scroll();
          }
          if (line.answer) answer = line.answer;
          if (line.error) error = line.error;
        }
        if (done) break;
      }
    } catch {
      // The connection dropped; the message below says so.
    }
    setWaiting(null);
    if (!answer) {
      setProblem(error);
      setQuestion(asked);
      return;
    }
    const got: Answer = answer;
    const stamp = Date.now();
    setThread((current) => [
      ...current,
      { id: `q-${stamp}`, role: "user", text: asked, citations: [], steps: [] },
      {
        id: `a-${stamp}`,
        role: "assistant",
        text: got.text,
        citations: got.citations,
        steps: got.steps,
      },
    ]);
    if (got.conversationId && got.conversationId !== conversation) {
      setConversation(got.conversationId);
      // So that reloading, or sharing the tab with yourself later, finds it again.
      window.history.replaceState(null, "", `/ask/${got.conversationId}`);
    }
    scroll();
  };

  return (
    <Stack gap="md" data-testid="ask-thread" data-ready={ready}>
      {thread.length === 0 && !waiting && examples.length > 0 && (
        <Group gap="xs" data-testid="ask-examples">
          {examples.map((example) => (
            <Button
              key={example}
              variant="default"
              size="compact-sm"
              radius="xl"
              onClick={() => setQuestion(example)}
            >
              {example}
            </Button>
          ))}
        </Group>
      )}

      {thread.map((turn) =>
        turn.role === "user" ? (
          <div key={turn.id} className={classes.question} data-testid="ask-question">
            {turn.text}
          </div>
        ) : (
          <Stack key={turn.id} gap={4}>
            <AnswerBody text={turn.text} citations={turn.citations} />
            {turn.steps.length > 0 && (
              <Text fz="xs" c="dimmed" data-testid="ask-looked-up">
                Looked up: {turn.steps.join(" · ")}
              </Text>
            )}
          </Stack>
        ),
      )}

      {waiting && (
        <>
          <div className={classes.question} data-testid="ask-question">
            {waiting.question}
          </div>
          <Group gap="sm" align="flex-start" data-testid="ask-waiting" aria-live="polite">
            <Loader size="xs" mt={4} />
            <ul className={classes.steps}>
              {waiting.steps.length === 0 ? (
                <li>Thinking...</li>
              ) : (
                waiting.steps.map((step, index) => <li key={index}>{step}</li>)
              )}
            </ul>
          </Group>
        </>
      )}

      {problem && (
        <Alert color="red" data-testid="ask-problem">
          {problem}
        </Alert>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(question);
        }}
      >
        <Group gap="xs" align="flex-end">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(question);
              }
            }}
            placeholder={thread.length === 0 ? "Ask about the family" : "Ask something else"}
            aria-label="Your question"
            autosize
            minRows={1}
            maxRows={6}
            maxLength={MAX_QUESTION_LENGTH}
            style={{ flex: 1 }}
            data-testid="ask-input"
          />
          <Button
            type="submit"
            disabled={!ready || !question.trim() || waiting !== null}
            leftSection={<IconSend size={16} />}
            data-testid="ask-send"
          >
            Ask
          </Button>
        </Group>
      </form>
      <div ref={end} />
    </Stack>
  );
}
