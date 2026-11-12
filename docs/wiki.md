# The wiki

The family's stories in prose, written together. There are two kinds of page:

- **A person's page** is part of their profile, under the recorded facts ("Their story"). Every
  person can have one.
- **A topic page** stands on its own under **Wiki**: a house, a business, a tradition, a trip.

Anyone who can add things can edit any page. Nothing written is ever lost: every save keeps the
whole text as a version, and any version can be brought back.

## Writing

The editor is a text box with a **Preview** drawn by the same code as the saved page.

| Type                           | To get                                      |
| ------------------------------ | ------------------------------------------- |
| `## The lake house`            | A section heading (`###` for a smaller one) |
| `- item` or `1. item`          | A list                                      |
| `> words`                      | A quotation                                 |
| `**bold**`, `*italic*`         | **bold**, _italic_                          |
| `[[Lucille Bluth]]`            | A link to that person, page or place        |
| `[[lucille\|Gangy]]`           | The same link, shown as "Gangy"             |
| `[words](https://example.com)` | A link to another website                   |

A `[[link]]` finds its target by any of a person's names (name, nickname, other names, or the
slug in their address), a topic page's title, or a place's name. When a person, a topic and a
place share a name, the person wins, then the topic. A name two people share links to neither.

A link to a page nobody has written yet shows in red with a dashed underline. Selecting it opens
a new page with the title filled in, which is the usual way a wiki grows.

Anything else typed is shown as typed. There is no HTML.

## History

**History** lists every version with who saved it, when, their note on what changed, and how many
lines it added and removed. A version's page shows exactly what it changed and the page as it
stood, with **Bring this version back**, which adds a new version on top rather than erasing
anything.

If two people edit the same page at once, the second to save is told so, keeps their text in the
editor, and nothing is overwritten.

Only an admin can delete a page, because that removes its history too.

## The wiki and the facts

The prose and the recorded facts are separate on purpose. Kinship ("who is grandma?") and dated
questions ("when were they married?") are answered from the record: people, relationships,
events. The wiki is where the family tells the story around them.

When someone writes "born in Sturgeon Bay in 1931" on a person's page, the page offers to record
it, with the page as its source. `docs/facts.md` describes how.

## For programs and assistants

| Route                                 | Tool                   |
| ------------------------------------- | ---------------------- |
| `GET /api/v1/articles`                | `list_articles`        |
| `GET /api/v1/articles/<slug>`         | `get_article`          |
| `POST /api/v1/articles`               | `add_article`          |
| `PATCH /api/v1/articles/<slug>`       | `write_article`        |
| `GET /api/v1/people/<slug>/article`   | `get_person_article`   |
| `PATCH /api/v1/people/<slug>/article` | `write_person_article` |

`PATCH` takes `body` (replaces the text) or `append` (adds to the end), and `summary`. The tool
descriptions tell assistants to prefer `append` and to keep what others wrote.

## How it is built

- `articles` holds the current text; `article_revisions` holds every version in full. A database
  trigger keeps `articles.search_vector` ready for search, which Ask will use.
- `src/lib/wiki/markup.ts` reads the markup into a tree; `src/components/wiki/ArticleBody.tsx`
  draws it. Both the page and the preview use them. `src/lib/wiki/diff.ts` compares versions.
- `src/server/wiki/service.ts`: read, save (with the check for someone else's edit), history,
  restore, delete, and the list of link targets.
- The Bluth seed turns each wiki document into a page (a person's own where `people.json` names
  it with `"article"`). Re-seeding never touches a page a person has edited.
- `e2e/wiki.spec.ts` covers reading, writing with links and preview, history and restore, two
  people editing at once, and the API.
