import { getChestConfig } from "@/lib/chest";
import { fakeExtract } from "@/lib/facts/fake";
import type { ExtractionInput } from "@/lib/facts/prompt";

/**
 * The language model behind reading facts and (later) answering questions.
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
  };
}

/** Reads a few fixed sentence shapes; see src/lib/facts/fake.ts. Never used in production. */
const fake: Llm = {
  name: "Stand-in model",
  json: async ({ user }) => fakeExtract(JSON.parse(user) as ExtractionInput),
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
