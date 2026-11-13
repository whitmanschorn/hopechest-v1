import { can } from "@/server/actor";
import { ask } from "@/server/ask/service";
import { currentActor } from "@/server/auth/session";

// Several model calls and lookups can take longer than the default allows.
export const maxDuration = 120;

/**
 * The website's way to ask: answers as lines of JSON, one per lookup as it is
 * made ({ step }) and a last one with the answer ({ answer }) or what went
 * wrong ({ error }), so the person waiting sees something happening.
 */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "read")) return new Response("Sign in to ask.", { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    question?: unknown;
    conversation?: unknown;
  } | null;
  const question = typeof body?.question === "string" ? body.question : "";
  const conversationId = typeof body?.conversation === "string" ? body.conversation : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        const result = await ask(actor, { question, conversationId }, (step) => send({ step }));
        send(result.ok ? { answer: result.answer } : { error: result.message });
      } catch (error) {
        console.error("Ask request failed", error);
        send({ error: "Something went wrong on our side." });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
