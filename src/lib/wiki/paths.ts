/** Where each view of a wiki page lives. Pure. */

export type ArticleRefLike = { kind: "person" | "topic"; slug: string };

/** A person's page is part of their profile; a topic has a page of its own. */
export const viewPath = (ref: ArticleRefLike) =>
  ref.kind === "person" ? `/people/${ref.slug}` : `/wiki/${ref.slug}`;

const base = (ref: ArticleRefLike) =>
  ref.kind === "person" ? `/people/${ref.slug}/article` : `/wiki/${ref.slug}`;

export const editPath = (ref: ArticleRefLike) => `${base(ref)}/edit`;
export const historyPath = (ref: ArticleRefLike) => `${base(ref)}/history`;
export const revisionPath = (ref: ArticleRefLike, id: string) => `${base(ref)}/history/${id}`;
/** Where a link to a page that does not exist yet goes: the form to start it. */
export const newPath = (title: string) => `/wiki/new?title=${encodeURIComponent(title)}`;
