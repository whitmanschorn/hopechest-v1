# Proposed facts

Not everything should be written straight into the family's record. A date an assistant read out
of a letter, or something a model worked out, might be wrong. Such things arrive as **proposed
facts**: a change that has been described but not made. A person accepts or rejects each one.

## What a proposal holds

- **The fact in plain words**: "George Sr. and Lucille married on 13 February 1965".
- **What accepting would do**: one of the changes to the family graph (add or change a person,
  add a relationship, record or change an event, add or change a place) with its details.
- **Where it came from**: the document, and the words in it that say so.
- **Who proposed it**, and optionally how sure they were.

## Reviewing

**Review → Proposed facts** lists what is waiting, oldest first.

- **Accept** makes the change, exactly as if you had typed it in yourself (it appears in the
  edit history under your name), and ties the result to the source. An event recorded this way
  shows the document under "Sources" on its page.
- If the change cannot be made (a person it names is no longer there, a date does not fit) the
  proposal stays in the queue and says why.
- **Reject** takes an optional reason. Nothing else changes.
- To accept something that is nearly right, accept it and then correct the event or person on its
  own page.

A document that an accepted or waiting fact points to cannot be deleted.

## Facts from what people write

A person's wiki page (`docs/wiki.md`) is read for facts each time it is saved. Saving is not held
up: the reading happens just after, and the suggestions appear on the person's page under their
story a few seconds later, each with the sentence it came from and Accept and Reject. "Look for
facts in this page" reads it again on request.

What is looked for: a birth or death date, a family name at birth or a nickname of the person the
page is about, and dated events in their life that involve only people already in the records.

A suggestion is only made when a program can check it:

- the sentence quoted must really be in the page;
- it may change only the person the page is about;
- every person an event names must already exist.

Anything the model says beyond that is dropped. A fact that was offered before, whether it is
waiting, accepted or rejected, is not offered again, so rejecting something settles it.

An accepted fact names the page as its source ("Lucille Bluth’s page in the wiki").

The model is DeepSeek where `DEEPSEEK_API_KEY` is set (`.env.example` lists the settings). The
page's text, the person's recorded facts and the list of people's names are sent to it. Without a
key, deployments other than production use a stand-in that understands a few fixed sentences
("born in 1931", "married [[Someone]] in 1955"), which is what the specs run against; production
without a key does not read pages at all.

## Proposing

Assistants propose with the `propose_fact` MCP tool, and programs with `POST /api/v1/claims`:

```json
{
  "statement": "George Sr. and Lucille married on 13 February 1965",
  "action": "add_event",
  "args": {
    "kind": "marriage",
    "title": "George Sr. and Lucille marry",
    "date": "1965-02-13",
    "participants": [{ "person": "george-sr" }, { "person": "lucille" }]
  },
  "document": "<id of the marriage licence>",
  "quote": "…were by me joined in marriage on the 13th day of February 1965",
  "confidence": 0.95,
  "agent": "Claude"
}
```

`action` is the name of one of the tools that change the chest, and `args` is exactly what that
tool takes; both are checked when the proposal is made. A key that can change things can also
write directly, so proposing is a matter of care, not permission: the tool descriptions tell
assistants to propose anything they read or worked out.

## How it is built

- `src/server/claims/service.ts`: propose, list, accept, reject. Accepting runs the action's own
  route from `src/server/api/routes.ts` as the reviewer, so validation and history are the same
  as for any edit, then records which row it made (`claims.applied_type`, `applied_id`).
- `src/server/sources.ts` reads that link back: the sources of an event, person or place are the
  sources of the accepted claims that produced it.
- `src/lib/claims/actions.ts`: the allowed actions and the plain-language rendering of `args`.
- `e2e/claims.spec.ts` covers proposing through the API, accepting and rejecting on the website,
  and the source showing on the event.

Not yet: reading documents and topic pages the same way.
