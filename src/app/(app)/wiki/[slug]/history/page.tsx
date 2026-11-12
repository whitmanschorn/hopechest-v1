import type { Metadata } from "next";
import { HistoryView } from "@/components/wiki/views";

export const metadata: Metadata = { title: "Page history · Hopechest" };

export default async function TopicHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  return <HistoryView articleRef={{ kind: "topic", slug: (await params).slug }} />;
}
