import type { Metadata } from "next";
import { RevisionView } from "@/components/wiki/views";

export const metadata: Metadata = { title: "An earlier version · Hopechest" };

export default async function PersonArticleRevisionPage({
  params,
}: {
  params: Promise<{ slug: string; revision: string }>;
}) {
  const { slug, revision } = await params;
  return <RevisionView articleRef={{ kind: "person", slug }} revisionId={revision} />;
}
