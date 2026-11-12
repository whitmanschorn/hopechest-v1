import type { Metadata } from "next";
import { HistoryView } from "@/components/wiki/views";

export const metadata: Metadata = { title: "Page history · Hopechest" };

export default async function PersonArticleHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <HistoryView articleRef={{ kind: "person", slug: (await params).slug }} />;
}
