import type { ChatMessage, ChatReply, ChatTool } from "@/lib/ask/chat";
import { fakeChat } from "@/lib/ask/fake";
import { getChestConfig } from "@/lib/chest";
import { fakeExtract } from "@/lib/facts/fake";
import type { ExtractionInput } from "@/lib/facts/prompt";

/**
 * The language model behind reading facts and answering questions.
 * Chosen by environment:
 *
 *   LLM_PROVIDER      deepseek | fake | none. Default: deepseek when
 *                     DEEPSEEK_API_KEY is set; otherwise fake outside
 *                     production, and none in production.
 *   DEEPSEEK_API_KEY  the key
 *   DEEPSEEK_BASE_URL default https://api.deepseek.com
 *   DEEPSEEK_MODEL    default deepseek-chat
 */
export interface Llm {
  /** Shown as who proposed a fact: "DeepSeek (deepseek-chat)". */
  name: string;
  /** One question, answered as JSON. Throws if the model cannot be reached or answers badly. */
  json(request: { system: string; user: string }): Promise<unknown>;
  /**
   * One turn of a conversation in which the model may ask for lookups. It
   * answers with words, or with the lookups it wants made first.
   */
  chat(request: {
    messages: readonly ChatMessage[];
    tools: readonly ChatTool[];
  }): Promise<ChatReply>;
}

function deepseek(key: string): Llm {
  const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  return {
    name: `DeepSeek (${model})`,
    async json({ system, user }) {
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`The model answered ${response.status}.`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return JSON.parse(body.choices?.[0]?.message?.content ?? "");
    },
    async chat({ messages, tools }) {
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
            ...(message.toolCalls?.length
              ? {
                  tool_calls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function",
                    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                  })),
                }
              : {}),
          })),
          ...(tools.length > 0
            ? { tools: tools.map((tool) => ({ type: "function", function: tool })) }
            : {}),
          temperature: 0,
          max_tokens: 1200,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`The model answered ${response.status}.`);
      const body = (await response.json()) as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: { id: string; function: { name: string; arguments: string } }[];
          };
        }[];
      };
      const message = body.choices?.[0]?.message;
      if (!message) throw new Error("The model sent nothing back.");
      return {
        content: message.content ?? "",
        toolCalls: (message.tool_calls ?? []).map((call) => {
          let args: unknown = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            // Badly formed arguments: the lookup will say what it needs.
          }
          return {
            id: call.id,
            name: call.function.name,
            arguments:
              typeof args === "object" && args !== null && !Array.isArray(args)
                ? (args as Record<string, unknown>)
                : {},
          };
        }),
      };
    },
  };
}

/** Reads a few fixed sentence shapes; see src/lib/facts/fake.ts. Never used in production. */
const fake: Llm = {
  name: "Stand-in model",
  json: async ({ user }) => fakeExtract(JSON.parse(user) as ExtractionInput),
  chat: async ({ messages }) => fakeChat(messages),
};

/** The model this deployment uses, or null when it has none. */
export function getLlm(): Llm | null {
  const production = getChestConfig().env === "production";
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  const wanted = process.env.LLM_PROVIDER?.trim().toLowerCase() || (key ? "deepseek" : "fake");
  if (wanted === "deepseek") return key ? deepseek(key) : null;
  if (wanted === "fake") return production ? null : fake;
  return null;
}
