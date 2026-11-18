/**
 * Puts the Bluth questions (seed/bluth/questions.jsonl) to a deployment's Ask
 * and has a model grade each answer against the reference.
 *
 *   npm run eval:ask -- [--env staging] [--only <id-or-kind>] [--out report.json]
 *
 * The deployment is reached like the command-line tool reaches it
 * (HOPECHEST_<NAME>_URL and _API_KEY). Grading uses DEEPSEEK_API_KEY from this
 * shell; without it the answers are printed ungraded. Every question costs a
 * few model calls on the deployment, so this runs on demand, not in CI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callApi, refusal } from "../cli/lib/api.ts";
import { resolveTarget } from "../cli/lib/config.ts";

interface Question {
  id: string;
  kind: string;
  asker?: string;
  question: string;
  /** What a good answer contains, written for a grader. */
  answer: string;
}

interface Outcome {
  id: string;
  kind: string;
  asker: string | null;
  question: string;
  answer: string;
  citations: number;
  seconds: number;
  pass: boolean | null;
  reason: string;
}

const GRADER = `You grade answers given by a family-archive assistant. You get a question, a REFERENCE written by the archive's editor describing what a good answer contains, and the CANDIDATE answer.

Pass the candidate only if all of these hold:
- It gives the facts the reference says a good answer gives (dates, names, places), with no factual disagreement with the reference.
- Where the reference says something is not recorded, the candidate says so too and does not supply a guess.
- Where the reference says the question rests on a wrong assumption, the candidate corrects it rather than going along.
- Where the reference says a date was deduced or is approximate, the candidate presents it that way, not as exact.
Extra true detail, different wording and missing source names are fine. Do not use anything you know about the family from elsewhere.

Answer with JSON only: {"pass": true|false, "reason": "one sentence"}`;

async function grade(key: string, item: Question, candidate: string) {
  const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      messages: [
        { role: "system", content: GRADER },
        {
          role: "user",
          content: JSON.stringify({
            question: item.question,
            askedBy: item.asker ?? "nobody in particular",
            reference: item.answer,
            candidate,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`The grader answered ${response.status}.`);
  const body = (await response.json()) as { choices: { message: { content: string } }[] };
  const verdict = JSON.parse(body.choices[0].message.content) as {
    pass?: unknown;
    reason?: unknown;
  };
  return { pass: verdict.pass === true, reason: String(verdict.reason ?? "") };
}

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const target = resolveTarget(option(args, "env"), process.env);
  const only = option(args, "only");
  const out = option(args, "out");
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  const questions = readFileSync(join(import.meta.dirname, "../seed/bluth/questions.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Question)
    .filter((item) => !only || item.id === only || item.kind === only);
  if (questions.length === 0) {
    console.error(`No question has the id or kind "${only}".`);
    return 2;
  }
  console.error(
    `${questions.length} questions to ${target.name} (${target.url})${key ? "" : "; no DEEPSEEK_API_KEY here, so answers are not graded"}.`,
  );

  const outcomes: Outcome[] = [];
  const queue = [...questions];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const started = Date.now();
      const reply = await callApi(target, {
        method: "POST",
        path: "ask",
        body: { question: item.question, ...(item.asker ? { as: item.asker } : {}) },
      });
      const answer: string = reply.ok ? reply.json.answer : `(no answer: ${refusal(reply)})`;
      let verdict: { pass: boolean | null; reason: string } = { pass: null, reason: "not graded" };
      if (!reply.ok) verdict = { pass: false, reason: "Ask did not answer." };
      else if (key) {
        verdict = await grade(key, item, answer).catch((error: Error) => ({
          pass: null,
          reason: error.message,
        }));
      }
      const outcome: Outcome = {
        id: item.id,
        kind: item.kind,
        asker: item.asker ?? null,
        question: item.question,
        answer,
        citations: reply.ok ? reply.json.citations.length : 0,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        ...verdict,
      };
      outcomes.push(outcome);
      const mark = outcome.pass === null ? "?" : outcome.pass ? "pass" : "FAIL";
      console.error(
        `${mark.padEnd(4)} ${item.id}${outcome.pass === false ? `: ${outcome.reason}` : ""}`,
      );
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  outcomes.sort(
    (a, b) => questions.findIndex((q) => q.id === a.id) - questions.findIndex((q) => q.id === b.id),
  );

  const graded = outcomes.filter((outcome) => outcome.pass !== null);
  const passed = graded.filter((outcome) => outcome.pass).length;
  const kinds = [...new Set(outcomes.map((outcome) => outcome.kind))];
  const summary = {
    target: target.name,
    questions: outcomes.length,
    graded: graded.length,
    passed,
    rate: graded.length > 0 ? Math.round((passed / graded.length) * 100) / 100 : null,
    byKind: Object.fromEntries(
      kinds.map((kind) => {
        const of = graded.filter((outcome) => outcome.kind === kind);
        return [kind, `${of.filter((outcome) => outcome.pass).length}/${of.length}`];
      }),
    ),
    cited: outcomes.filter((outcome) => outcome.citations > 0).length,
    medianSeconds: outcomes.map((o) => o.seconds).sort((a, b) => a - b)[outcomes.length >> 1],
    failed: graded.filter((outcome) => !outcome.pass).map(({ id, reason }) => ({ id, reason })),
  };
  if (out) writeFileSync(out, JSON.stringify({ summary, outcomes }, null, 2) + "\n");
  console.log(JSON.stringify(out ? summary : { summary, outcomes }, null, 2));
  return 0;
}

process.exitCode = await main();
