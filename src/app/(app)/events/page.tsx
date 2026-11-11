import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";

/** Events are listed on the timeline. */
export default async function EventsPage() {
  await requireActor("read");
  redirect("/timeline");
}
