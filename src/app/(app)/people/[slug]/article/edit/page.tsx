import type { Metadata } from "next";
import { EditArticleView } from "@/components/wiki/views";

export const metadata: Metadata = { title: "Edit a page · Hopechest" };

export default async function EditPersonArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <EditArticleView articleRef={{ kind: "person", slug: (await params).slug }} />;
}
