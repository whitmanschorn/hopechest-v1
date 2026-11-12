"use client";

import { useActionState } from "react";
import { ActionIcon, Button, Group, Paper, Stack, Text, Textarea, Title } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import {
  addCommentAction,
  deleteCommentAction,
  reactAction,
  type CommentState,
} from "@/app/(app)/photos/actions";
import { MAX_COMMENT_LENGTH } from "@/lib/photos/reactions";
import type { PhotoComment, ReactionCount } from "@/server/photos/talk";

export interface TalkComment extends Omit<PhotoComment, "at"> {
  /** Already written out, so the server and the browser agree on it. */
  when: string;
}

/** Reactions and comments under a photo. */
export function PhotoTalk({
  photoId,
  reactions,
  comments,
  canTakePart,
}: {
  photoId: string;
  reactions: ReactionCount[];
  comments: TalkComment[];
  canTakePart: boolean;
}) {
  const start: CommentState = { text: "", message: null };
  const [state, post, posting] = useActionState(addCommentAction, start);

  return (
    <Stack gap="md" component="section" data-testid="photo-talk">
      <form action={reactAction}>
        <input type="hidden" name="photoId" value={photoId} />
        <Group gap="xs" data-testid="reactions">
          {reactions.map((reaction) => (
            <Button
              key={reaction.emoji}
              type="submit"
              name="emoji"
              value={reaction.emoji}
              variant={reaction.mine ? "light" : "default"}
              size="compact-md"
              radius="xl"
              disabled={!canTakePart}
              aria-pressed={reaction.mine}
              aria-label={`${reaction.label}: ${reaction.count}`}
              data-testid={`react-${reaction.label.toLowerCase()}`}
              data-count={reaction.count}
            >
              <span aria-hidden>{reaction.emoji}</span>
              {reaction.count > 0 && (
                <Text span fz="sm" ml={6} aria-hidden>
                  {reaction.count}
                </Text>
              )}
            </Button>
          ))}
        </Group>
      </form>

      <Title order={2} fz="h4">
        {comments.length === 0
          ? "Comments"
          : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
      </Title>
      {comments.length === 0 && (
        <Text c="dimmed" data-testid="no-comments">
          Nobody has said anything yet. Who is this? Where was it taken?
        </Text>
      )}
      <Stack gap="sm" data-testid="comments">
        {comments.map((comment) => (
          <Paper
            key={comment.id}
            p="sm"
            radius="md"
            withBorder
            bg="var(--hc-surface)"
            data-testid="comment"
          >
            <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
              <div style={{ minWidth: 0 }}>
                <Text fz="sm">
                  <Text span fw={600} data-testid="comment-author">
                    {comment.author}
                  </Text>
                  <Text span c="dimmed">
                    {" · "}
                    {comment.when}
                  </Text>
                </Text>
                <Text
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  data-testid="comment-body"
                >
                  {comment.body}
                </Text>
              </div>
              {comment.canDelete && (
                <form action={deleteCommentAction}>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <ActionIcon
                    type="submit"
                    variant="subtle"
                    color="gray"
                    aria-label={`Delete the comment by ${comment.author}`}
                    data-testid="delete-comment"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </form>
              )}
            </Group>
          </Paper>
        ))}
      </Stack>

      {canTakePart && (
        <form action={post} data-testid="comment-form">
          <input type="hidden" name="photoId" value={photoId} />
          <Stack gap="xs">
            <Textarea
              // A new key after each attempt puts back what was typed, or clears it once posted.
              key={`${comments.length}:${state.text}`}
              name="body"
              label="Add a comment"
              autosize
              minRows={2}
              maxLength={MAX_COMMENT_LENGTH}
              defaultValue={state.text}
              error={state.message}
              data-testid="comment-input"
            />
            <div>
              <Button type="submit" loading={posting} data-testid="post-comment">
                Post
              </Button>
            </div>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
