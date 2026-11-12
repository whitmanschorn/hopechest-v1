import { getDb } from "@/lib/db";
import { isReaction, MAX_COMMENT_LENGTH, REACTIONS } from "@/lib/photos/reactions";
import { assertCan, can, type Actor } from "@/server/actor";
import { memberName } from "@/server/memberName";

export interface PhotoComment {
  id: string;
  body: string;
  author: string;
  at: Date;
  /** Whether the signed-in person may delete it: their own, or any for an admin. */
  canDelete: boolean;
}

export interface ReactionCount {
  emoji: string;
  label: string;
  count: number;
  /** Whether the signed-in person has given this one. */
  mine: boolean;
}

export interface PhotoTalk {
  comments: PhotoComment[];
  reactions: ReactionCount[];
  /** Only signed-in members can comment and react; an API key cannot. */
  canTakePart: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the family has said about a photo: comments oldest first, and reaction counts. */
export async function getPhotoTalk(actor: Actor, photoId: string): Promise<PhotoTalk> {
  assertCan(actor, "read");
  const userId = actor.kind === "user" ? actor.userId : null;
  const empty = REACTIONS.map((reaction) => ({ ...reaction, count: 0, mine: false }));
  if (!UUID.test(photoId)) return { comments: [], reactions: empty, canTakePart: false };
  const db = getDb();
  const [comments, reactions] = await Promise.all([
    db.comment.findMany({
      where: { photoId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
      include: { author: { select: { phone: true, person: { select: { displayName: true } } } } },
    }),
    db.reaction.findMany({ where: { photoId }, select: { emoji: true, userId: true } }),
  ]);
  return {
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      author: memberName(comment.author),
      at: comment.createdAt,
      canDelete: (userId !== null && comment.authorId === userId) || can(actor, "admin"),
    })),
    reactions: empty.map((reaction) => {
      const given = reactions.filter((row) => row.emoji === reaction.emoji);
      return {
        ...reaction,
        count: given.length,
        mine: given.some((row) => row.userId === userId),
      };
    }),
    canTakePart: userId !== null,
  };
}

export type CommentResult = { ok: true } | { ok: false; message: string };

export async function addComment(
  actor: Actor,
  photoId: string,
  text: string,
): Promise<CommentResult> {
  assertCan(actor, "read");
  if (actor.kind !== "user") return { ok: false, message: "Only a signed-in member can comment." };
  const body = text.trim();
  if (!body) return { ok: false, message: "Write something first." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, message: "Keep a comment under 2,000 characters." };
  }
  const db = getDb();
  const photo = UUID.test(photoId)
    ? await db.photo.findUnique({ where: { id: photoId }, select: { id: true } })
    : null;
  if (!photo) return { ok: false, message: "That photo is no longer in the chest." };
  await db.comment.create({ data: { photoId, authorId: actor.userId, body } });
  return { ok: true };
}

/** Takes a comment down. Its author can, and so can an admin. */
export async function deleteComment(actor: Actor, commentId: string): Promise<void> {
  assertCan(actor, "read");
  if (!UUID.test(commentId)) return;
  const db = getDb();
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) return;
  const own = actor.kind === "user" && comment.authorId === actor.userId;
  if (!own) assertCan(actor, "admin");
  await db.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
}

/** Gives a reaction, or takes it back if already given. */
export async function toggleReaction(actor: Actor, photoId: string, emoji: string): Promise<void> {
  assertCan(actor, "read");
  if (actor.kind !== "user" || !isReaction(emoji) || !UUID.test(photoId)) return;
  const db = getDb();
  const key = { photoId_userId_emoji: { photoId, userId: actor.userId, emoji } };
  const existing = await db.reaction.findUnique({ where: key, select: { id: true } });
  if (existing) {
    await db.reaction.deleteMany({ where: { id: existing.id } });
    return;
  }
  const photo = await db.photo.findUnique({ where: { id: photoId }, select: { id: true } });
  if (!photo) return;
  // Two taps at once would both try to add it; the second is simply already done.
  await db.reaction.upsert({
    where: key,
    create: { photoId, userId: actor.userId, emoji },
    update: {},
  });
}
