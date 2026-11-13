# Ask

Ask answers a question in plain words from what the chest holds, and says where each fact came
from. "When did grandma and grandpa get married?" works, because the chest knows who is asking
and who their grandparents are.

## How an answer is made

1. The question goes to the model with a short brief (`src/lib/ask/prompt.ts`): who is asking,
   answer only from lookups, say "not recorded" rather than guess, correct a wrong assumption,
   present approximate and worked-out dates as such, and mark where each fact came from.
2. The model asks for lookups. These are the read-only tools assistants already have over MCP
   (`ASK_TOOLS`): find people, resolve family words, list events, search and read documents,
   follow the graph, read the wiki, look at places. Each runs through the same REST route as the
   API, **as the person asking**, so Ask can never show someone more than they could see
   themselves, and it cannot change anything.
3. After at most six rounds of lookups it answers. It marks sources as `[person:lucille]` or
   `[event:<id>]`.
4. The marks are checked by a program (`src/lib/ask/cite.ts`): one is kept only if that slug or
   id came back from a lookup made for this question, and the thing still exists. The rest are
   removed. The kept ones become numbered links under the answer.

A member's questions are kept as conversations (`conversations`, `messages`), visible only to
them, so "and her sister?" works as a follow-up. They can delete a conversation.

## Where it is

- **Website:** Ask in the menu. Lookups show as they happen.
- **API:** `POST /api/v1/ask` with `question` and, optionally, `as` (the slug of the person whose
  point of view to take). Each call stands alone. There is no MCP tool for it: an assistant with
  the MCP tools is already doing what Ask does.

## The model

Ask uses whatever `getLlm()` gives (`src/server/llm/`): DeepSeek when `DEEPSEEK_API_KEY` is set,
a scripted stand-in otherwise (never in production), nothing at all in production without a key,
in which case the page says asking is not set up.

**What leaves the site:** the question, the brief, and the results of the lookups the model asks
for (names, dates, event descriptions, passages of documents) are sent to the model's provider.
On staging that is fictional Bluth data. On a family's site it is their real records, going to
DeepSeek. Decide whether that is acceptable before giving a family site a key; the provider is
one function in `src/server/llm/index.ts` if it should be a different one.

A member may ask 40 questions an hour. A question typically takes five to ten seconds and three
or four model calls.

## Checking the answers

```
npm run eval:ask -- --env staging            # all 35 Bluth questions
npm run eval:ask -- --only trap              # one kind, or one question by id
npm run eval:ask -- --out report.json        # keep every answer and verdict
```

It puts each question in `seed/bluth/questions.jsonl` to the deployment's Ask (as the question's
asker, where it has one) and has a model grade the answer against the reference written beside
the question. It needs the deployment's API key as the command-line tool does, and
`DEEPSEEK_API_KEY` in the shell for grading. It costs a few cents and runs on demand, not in CI.

First run, 12 November 2026, local server with the Bluth seed and `deepseek-chat`: **34 of 35**
(graph 16/17, documents 9/9, traps 7/7, deductions 2/2), median 5.4 seconds. The grader is the
same model family as the answerer, so read failures and a sample of passes yourself; the first
run's sample held up. The one miss was "What was the family's first business?", where the answer
gave both the company and the banana stand as founded in 1953.

Specs (`e2e/ask.spec.ts`) run against the stand-in, which follows one fixed plan
(`src/lib/ask/fake.ts`); they test everything around the model, not the quality of answers.

## Limits

- Answers are only as good as the record. A fact that is only in a photo caption or a wiki
  sentence is found only if a lookup happens to read it.
- Documents are found by word search, not by meaning.
- The model sometimes cites the event but not the document behind it.
- The answer arrives whole, not word by word.
- Asking cannot add knowledge yet ("Grandma was born in Sturgeon Bay"). That is the next step,
  through proposed facts.
