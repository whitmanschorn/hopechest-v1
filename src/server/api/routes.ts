import { asList, asText, mergeText } from "@/lib/api/match";
import { getChestConfig } from "@/lib/chest";
import { dateToText, toEventFormInput, type EventFormInput } from "@/lib/events/eventEdit";
import { toFormInput, type PersonFormInput } from "@/lib/people/personEdit";
import { toPlaceFormInput, type PlaceFormInput } from "@/lib/places/placeEdit";
import type { Actor, Permission } from "@/server/actor";
import {
  getArticle,
  getHistory,
  listArticles,
  saveArticle,
  type ArticleRef,
} from "@/server/wiki/service";
import {
  createAlbum,
  deleteAlbum,
  getAlbum,
  listAlbums,
  updateAlbum,
} from "@/server/albums/service";
import {
  acceptClaim,
  getClaim,
  listClaims,
  proposeClaim,
  rejectClaim,
} from "@/server/claims/service";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "@/server/documents/service";
import {
  createEvent,
  deleteEvent,
  eventValues,
  getEvent,
  getEventSources,
  listEvents,
  updateEvent,
} from "@/server/events/service";
import {
  addRelationship,
  createPerson,
  getPerson,
  getPersonHistory,
  listPeople,
  removeRelationship,
  resolveKin,
  updatePerson,
  type RelationInput,
} from "@/server/people/service";
import {
  addItem,
  completeBatch,
  datePhotos,
  discardPhotos,
  getBatch,
  listBatches,
  openBatch,
  publishPhotos,
} from "@/server/ingest/service";
import { deletePhoto, getPhoto, listPhotos, updatePhoto } from "@/server/photos/service";
import {
  createPlace,
  deletePlace,
  getPlace,
  listPlaces,
  updatePlace,
} from "@/server/places/service";

/**
 * The REST API: one table of routes, each a thin wrapper over a service
 * function. The services check permissions and validate; nothing here does.
 * `GET /api/v1` lists this table, so the API describes itself.
 */

export interface ApiContext {
  actor: Actor;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

export interface ApiReply {
  status: number;
  body: unknown;
}

export interface ApiRoute {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path under /api/v1, with ":name" for the parts that vary. */
  path: string;
  needs: Permission;
  summary: string;
  /** Fields a POST or PATCH body takes, for the listing. */
  fields?: string;
  run(context: ApiContext): Promise<ApiReply>;
}

const ok = (body: unknown, status = 200): ApiReply => ({ status, body });
const missing = (what: string): ApiReply => ({
  status: 404,
  body: { error: "not_found", message: `No ${what} with that address.` },
});
/** A service said no: field messages where it has them, one message where not. */
const invalid = (result: { errors?: object; message?: string }): ApiReply => ({
  status: 422,
  body: {
    error: "invalid",
    message: result.message ?? "Some fields need another look.",
    fields: result.errors ?? {},
  },
});

const BLANK_PERSON: PersonFormInput = {
  displayName: "",
  givenName: "",
  familyName: "",
  birthFamilyName: "",
  nicknames: "",
  alternateNames: "",
  gender: "",
  living: "",
  born: "",
  died: "",
  notes: "",
};
const BLANK_PLACE: PlaceFormInput = {
  label: "",
  street: "",
  city: "",
  region: "",
  country: "",
  lat: "",
  lng: "",
  notes: "",
};
const BLANK_EVENT_TEXT = {
  kind: "other",
  title: "",
  description: "",
  date: "",
  deduced: "",
  clue: "",
  place: "",
};

const PERSON_FIELDS =
  "displayName, givenName, familyName, birthFamilyName, nicknames (list), alternateNames (list), " +
  'gender (female|male|other), living (true|false), born, died (dates as text: "1967-12-14", "1989", "around 1964"), notes';
const RELATION_FIELDS =
  "role (what the other person is to this one: parent|child|partner), other (their slug), " +
  "qualifier (parent/child: biological|adoptive|step|foster|legal; partner: married|partnered), " +
  "endReason (optional: divorce|separation|annulment|death|other)";
const EVENT_FIELDS =
  "kind (birth|death|marriage|divorce|move|immigration|military|education|work|other), title, description, " +
  'date (text, e.g. "1964" or "around 1964"), deduced (true when the date was worked out), clue (how it was worked out), ' +
  "place (slug), participants (list of { person: slug, role: subject|parent|child|officiant|witness|other })";
const PLACE_FIELDS = "label, street, city, region, country, lat, lng, notes";
const PHOTO_FIELDS =
  "caption, date (text), photographer, people (list of slugs), albums (list of album ids)";
const ARTICLE_FIELDS =
  "title, body (text with ## headings, - lists, **bold**, [[links to people or pages]]), " +
  "append (text to add to the end, instead of body), summary (what changed, for the history)";

async function readArticle(actor: Actor, ref: ArticleRef): Promise<ApiReply> {
  const article = await getArticle(actor, ref);
  return article ? ok({ article }) : missing(ref.kind === "person" ? "person" : "page");
}

/** Saves a page from a request: the whole text, or an addition to what is there. */
async function writeArticle(
  actor: Actor,
  ref: ArticleRef,
  body: Record<string, unknown>,
): Promise<ApiReply> {
  const current = await getArticle(actor, ref);
  if (!current) return missing(ref.kind === "person" ? "person" : "page");
  const addition = asText(body.append).trim();
  const text =
    "body" in body
      ? asText(body.body)
      : addition
        ? [current.body, addition].filter(Boolean).join("\n\n")
        : current.body;
  const result = await saveArticle(actor, ref, {
    title: "title" in body ? asText(body.title) : undefined,
    body: text,
    summary: asText(body.summary) || undefined,
  });
  if (!result.ok) return invalid(result);
  return ok({ article: await getArticle(actor, result.ref), changed: result.changed });
}

const DOCUMENT_FIELDS =
  'title, kind (letter|record|recipe|story|article|other), date (text, e.g. "1933"), ' +
  "text (what it says; ## starts a section heading)";
const BLANK_DOCUMENT = { title: "", kind: "other", date: "", text: "" };
const ALBUM_FIELDS = "title, description, cover (id of a photo in the album)";

function relation(body: Record<string, unknown>): RelationInput {
  return {
    role: asText(body.role),
    otherSlug: asText(body.other),
    qualifier: asText(body.qualifier),
    endReason: asText(body.endReason) || undefined,
  };
}

/** The event form from a request, on top of what is there already. */
function eventForm(current: EventFormInput | null, body: Record<string, unknown>): EventFormInput {
  const { participants, ...text } = current ?? { ...BLANK_EVENT_TEXT, participants: [] };
  // "deduced: false" must clear the flag, and the form's word for that is "".
  const merged = mergeText(text, body);
  if (merged.deduced !== "yes") merged.deduced = "";
  const sent = Array.isArray(body.participants) ? body.participants : null;
  return {
    ...merged,
    participants: sent
      ? sent
          .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && !!entry)
          .map((entry) => ({ person: asText(entry.person), role: asText(entry.role) || "subject" }))
      : participants,
  };
}

export const ROUTES: readonly ApiRoute[] = [
  // ── people ──
  {
    method: "GET",
    path: "people",
    needs: "read",
    summary: "Everyone in the chest, by name. ?q= matches any of a person's names.",
    run: async ({ actor, query }) => ok({ people: await listPeople(actor, query.get("q") ?? "") }),
  },
  {
    method: "POST",
    path: "people",
    needs: "write",
    summary: "Add a person, optionally tied to someone already in the chest with `relation`.",
    fields: `${PERSON_FIELDS}; relation: { ${RELATION_FIELDS} }`,
    run: async ({ actor, body }) => {
      const tie =
        typeof body.relation === "object" && body.relation
          ? relation(body.relation as Record<string, unknown>)
          : undefined;
      const result = await createPerson(actor, mergeText(BLANK_PERSON, body), tie);
      if (!result.ok) return invalid(result);
      return ok({ person: await getPerson(actor, result.slug) }, 201);
    },
  },
  {
    method: "GET",
    path: "people/:slug",
    needs: "read",
    summary: "One person: names, dates, parents, partners, children, siblings and life events.",
    run: async ({ actor, params }) => {
      const person = await getPerson(actor, params.slug);
      return person ? ok({ person }) : missing("person");
    },
  },
  {
    method: "PATCH",
    path: "people/:slug",
    needs: "write",
    summary: "Change a person. Only the fields sent are changed.",
    fields: PERSON_FIELDS,
    run: async ({ actor, params, body }) => {
      const person = await getPerson(actor, params.slug);
      if (!person) return missing("person");
      const result = await updatePerson(
        actor,
        params.slug,
        mergeText(toFormInput(person.values), body),
      );
      if (!result.ok) return invalid(result);
      return ok({ person: await getPerson(actor, result.slug) });
    },
  },
  {
    method: "GET",
    path: "people/:slug/history",
    needs: "read",
    summary: "Who changed what on a person, newest first.",
    run: async ({ actor, params }) => {
      const history = await getPersonHistory(actor, params.slug);
      return history ? ok(history) : missing("person");
    },
  },
  {
    method: "POST",
    path: "people/:slug/relationships",
    needs: "write",
    summary: "Link this person to another already in the chest.",
    fields: RELATION_FIELDS,
    run: async ({ actor, params, body }) => {
      const result = await addRelationship(actor, params.slug, relation(body));
      if (!result.ok) return invalid(result);
      return ok({ person: await getPerson(actor, params.slug) }, 201);
    },
  },
  {
    method: "DELETE",
    path: "relationships/:id",
    needs: "write",
    summary:
      "Remove a link between two people (the id is `relationshipId` on a person's relatives).",
    run: async ({ actor, params }) => {
      if (!/^[0-9a-f-]{36}$/i.test(params.id)) return missing("relationship");
      await removeRelationship(actor, params.id);
      return ok({ ok: true });
    },
  },

  {
    method: "GET",
    path: "kin",
    needs: "read",
    summary:
      "Who family words mean for one person. ?person=<slug>&words=grandma and grandpa answers with the people each word means for them.",
    run: async ({ actor, query }) => {
      const kin = await resolveKin(actor, query.get("person") ?? "", query.get("words") ?? "");
      return kin ? ok({ kin }) : missing("person");
    },
  },

  // ── events ──
  {
    method: "GET",
    path: "events",
    needs: "read",
    summary: "Events in date order. Filter with ?kind=marriage, ?person=<slug>, ?place=<slug>.",
    run: async ({ actor, query }) =>
      ok({
        events: await listEvents(actor, {
          kind: query.get("kind") ?? undefined,
          person: query.get("person") ?? undefined,
          place: query.get("place") ?? undefined,
        }),
      }),
  },
  {
    method: "POST",
    path: "events",
    needs: "write",
    summary: "Record an event. A marriage or divorce needs two subjects; a birth or death one.",
    fields: EVENT_FIELDS,
    run: async ({ actor, body }) => {
      const result = await createEvent(actor, eventForm(null, body));
      if (!result.ok) return invalid(result);
      return ok({ event: await getEvent(actor, result.id) }, 201);
    },
  },
  {
    method: "GET",
    path: "events/:id",
    needs: "read",
    summary: "One event, with the sources that back it up.",
    run: async ({ actor, params }) => {
      const event = await getEvent(actor, params.id);
      if (!event) return missing("event");
      return ok({ event, sources: await getEventSources(actor, params.id) });
    },
  },
  {
    method: "PATCH",
    path: "events/:id",
    needs: "write",
    summary:
      "Change an event. Only the fields sent are changed; `participants` replaces the whole list.",
    fields: EVENT_FIELDS,
    run: async ({ actor, params, body }) => {
      const event = await getEvent(actor, params.id);
      if (!event) return missing("event");
      const current = toEventFormInput(eventValues(event));
      const result = await updateEvent(actor, params.id, eventForm(current, body));
      if (!result.ok) return invalid(result);
      return ok({ event: await getEvent(actor, params.id) });
    },
  },
  {
    method: "DELETE",
    path: "events/:id",
    needs: "write",
    summary: "Delete an event.",
    run: async ({ actor, params }) =>
      (await deleteEvent(actor, params.id)) ? ok({ ok: true }) : missing("event"),
  },

  // ── places ──
  {
    method: "GET",
    path: "places",
    needs: "read",
    summary: "Every place, by name.",
    run: async ({ actor }) => ok({ places: await listPlaces(actor) }),
  },
  {
    method: "POST",
    path: "places",
    needs: "write",
    summary: "Add a place.",
    fields: PLACE_FIELDS,
    run: async ({ actor, body }) => {
      const result = await createPlace(actor, mergeText(BLANK_PLACE, body));
      if (!result.ok) return invalid(result);
      return ok({ place: await getPlace(actor, result.slug) }, 201);
    },
  },
  {
    method: "GET",
    path: "places/:slug",
    needs: "read",
    summary: "One place.",
    run: async ({ actor, params }) => {
      const place = await getPlace(actor, params.slug);
      return place ? ok({ place }) : missing("place");
    },
  },
  {
    method: "PATCH",
    path: "places/:slug",
    needs: "write",
    summary: "Change a place. Only the fields sent are changed.",
    fields: PLACE_FIELDS,
    run: async ({ actor, params, body }) => {
      const place = await getPlace(actor, params.slug);
      if (!place) return missing("place");
      const result = await updatePlace(
        actor,
        params.slug,
        mergeText(toPlaceFormInput(place.values), body),
      );
      if (!result.ok) return invalid(result);
      return ok({ place: await getPlace(actor, params.slug) });
    },
  },
  {
    method: "DELETE",
    path: "places/:slug",
    needs: "write",
    summary: "Delete a place. Events that happened there are kept and lose their place.",
    run: async ({ actor, params }) =>
      (await deletePlace(actor, params.slug)) ? ok({ ok: true }) : missing("place"),
  },

  // ── documents ──
  {
    method: "GET",
    path: "documents",
    needs: "read",
    summary:
      "Documents by title, or with ?q= the ones whose words match, best first, each with an excerpt. ?kind= narrows.",
    run: async ({ actor, query }) =>
      ok(
        await listDocuments(actor, {
          q: query.get("q") ?? undefined,
          kind: query.get("kind") ?? undefined,
        }),
      ),
  },
  {
    method: "POST",
    path: "documents",
    needs: "write",
    summary: "Add a document from its text. The same text added twice gives the one already there.",
    fields: DOCUMENT_FIELDS,
    run: async ({ actor, body }) => {
      const result = await createDocument(actor, mergeText(BLANK_DOCUMENT, body));
      if (!result.ok) return invalid(result);
      return ok(
        { document: await getDocument(actor, result.id), duplicate: result.duplicate },
        result.duplicate ? 200 : 201,
      );
    },
  },
  {
    method: "GET",
    path: "documents/:id",
    needs: "read",
    summary: "One document: its title, kind, date, full text and how to cite it.",
    run: async ({ actor, params }) => {
      const document = await getDocument(actor, params.id);
      return document ? ok({ document }) : missing("document");
    },
  },

  {
    method: "PATCH",
    path: "documents/:id",
    needs: "write",
    summary: "Change a document's details, or set its text (to type out a scanned page).",
    fields: DOCUMENT_FIELDS,
    run: async ({ actor, params, body }) => {
      const doc = await getDocument(actor, params.id);
      if (!doc) return missing("document");
      const result = await updateDocument(
        actor,
        params.id,
        mergeText(
          { title: doc.title, kind: doc.kind, date: dateToText(doc.date), text: doc.text ?? "" },
          body,
        ),
      );
      if (!result.ok) return invalid(result);
      return ok({ document: await getDocument(actor, params.id) });
    },
  },
  {
    method: "DELETE",
    path: "documents/:id",
    needs: "write",
    summary: "Delete a document. Refused while recorded facts cite it.",
    run: async ({ actor, params }) => {
      if (!(await getDocument(actor, params.id))) return missing("document");
      const result = await deleteDocument(actor, params.id);
      if (!result.ok) return { status: 409, body: { error: "cited", message: result.message } };
      return ok({ ok: true });
    },
  },

  // ── photos ──
  {
    method: "GET",
    path: "photos",
    needs: "read",
    summary:
      "Photos, newest upload first, 60 at a time. ?person=<slug> for one person's; ?before=<id> (the `next` of the last page) for older ones.",
    run: async ({ actor, query }) =>
      ok(
        await listPhotos(actor, {
          person: query.get("person") ?? undefined,
          before: query.get("before") ?? undefined,
        }),
      ),
  },
  {
    method: "GET",
    path: "photos/:id",
    needs: "read",
    summary: "One photo: caption, date, who is in it and where, albums, file addresses.",
    run: async ({ actor, params }) => {
      const photo = await getPhoto(actor, params.id);
      return photo ? ok({ photo }) : missing("photo");
    },
  },
  {
    method: "PATCH",
    path: "photos/:id",
    needs: "write",
    summary: "Change a photo's details. `people` and `albums`, when sent, replace the whole list.",
    fields: PHOTO_FIELDS,
    run: async ({ actor, params, body }) => {
      const photo = await getPhoto(actor, params.id);
      if (!photo) return missing("photo");
      const text = mergeText(
        {
          caption: photo.caption ?? "",
          date: dateToText(photo.date),
          photographer: photo.photographer ?? "",
        },
        body,
      );
      const result = await updatePhoto(actor, params.id, {
        ...text,
        people: "people" in body ? asList(body.people) : photo.people.map((person) => person.slug),
        albums: "albums" in body ? asList(body.albums) : photo.albums.map((album) => album.id),
      });
      if (!result.ok) return invalid(result);
      return ok({ photo: await getPhoto(actor, params.id) });
    },
  },
  {
    method: "DELETE",
    path: "photos/:id",
    needs: "write",
    summary: "Delete a photo and its stored files.",
    run: async ({ actor, params }) => {
      if (!(await getPhoto(actor, params.id))) return missing("photo");
      await deletePhoto(actor, params.id);
      return ok({ ok: true });
    },
  },

  // ── albums ──
  {
    method: "GET",
    path: "albums",
    needs: "read",
    summary: "Every album, with its cover and how many photos it holds.",
    run: async ({ actor }) => ok({ albums: await listAlbums(actor) }),
  },
  {
    method: "POST",
    path: "albums",
    needs: "write",
    summary: "Make an album.",
    fields: "title, description",
    run: async ({ actor, body }) => {
      const result = await createAlbum(
        actor,
        mergeText({ title: "", description: "", cover: "" }, body),
      );
      if (!result.ok) return invalid(result);
      return ok({ album: await getAlbum(actor, result.id) }, 201);
    },
  },
  {
    method: "GET",
    path: "albums/:id",
    needs: "read",
    summary: "One album and its photos, in order.",
    run: async ({ actor, params }) => {
      const album = await getAlbum(actor, params.id);
      return album ? ok({ album }) : missing("album");
    },
  },
  {
    method: "PATCH",
    path: "albums/:id",
    needs: "write",
    summary: "Rename an album, describe it, or choose its cover. Only the fields sent are changed.",
    fields: ALBUM_FIELDS,
    run: async ({ actor, params, body }) => {
      const album = await getAlbum(actor, params.id);
      if (!album) return missing("album");
      const result = await updateAlbum(
        actor,
        params.id,
        mergeText(
          {
            title: album.title,
            description: album.description ?? "",
            cover: album.coverPhotoId ?? "",
          },
          body,
        ),
      );
      if (!result.ok) return invalid(result);
      return ok({ album: await getAlbum(actor, params.id) });
    },
  },
  {
    method: "DELETE",
    path: "albums/:id",
    needs: "write",
    summary: "Delete an album. Its photos stay in the chest.",
    run: async ({ actor, params }) => {
      if (!(await getAlbum(actor, params.id))) return missing("album");
      await deleteAlbum(actor, params.id);
      return ok({ ok: true });
    },
  },

  // ── wiki ──
  {
    method: "GET",
    path: "articles",
    needs: "read",
    summary: "Every wiki page: topic pages, and the people who have been written about.",
    run: async ({ actor }) => ok(await listArticles(actor)),
  },
  {
    method: "POST",
    path: "articles",
    needs: "write",
    summary: "Start a topic page. (A person's page is written at people/:slug/article.)",
    fields: ARTICLE_FIELDS,
    run: async ({ actor, body }) => {
      const result = await saveArticle(actor, null, {
        title: asText(body.title),
        body: asText(body.body),
        summary: asText(body.summary) || undefined,
      });
      if (!result.ok) return invalid(result);
      return ok({ article: await getArticle(actor, result.ref) }, 201);
    },
  },
  {
    method: "GET",
    path: "articles/:slug",
    needs: "read",
    summary: "One topic page: its title and text.",
    run: ({ actor, params }) => readArticle(actor, { kind: "topic", slug: params.slug }),
  },
  {
    method: "PATCH",
    path: "articles/:slug",
    needs: "write",
    summary: "Change a topic page. `body` replaces the text; `append` adds to the end instead.",
    fields: ARTICLE_FIELDS,
    run: ({ actor, params, body }) =>
      writeArticle(actor, { kind: "topic", slug: params.slug }, body),
  },
  {
    method: "GET",
    path: "articles/:slug/history",
    needs: "read",
    summary: "Every saved version of a topic page, newest first.",
    run: async ({ actor, params }) => {
      const history = await getHistory(actor, { kind: "topic", slug: params.slug });
      return history ? ok({ history }) : missing("page");
    },
  },
  {
    method: "GET",
    path: "people/:slug/article",
    needs: "read",
    summary: "What has been written about a person: their wiki page. Empty if nothing yet.",
    run: ({ actor, params }) => readArticle(actor, { kind: "person", slug: params.slug }),
  },
  {
    method: "PATCH",
    path: "people/:slug/article",
    needs: "write",
    summary:
      "Write or change a person's wiki page. `body` replaces the text; `append` adds to the end instead.",
    fields: "body, append, summary (what changed)",
    run: ({ actor, params, body }) =>
      writeArticle(actor, { kind: "person", slug: params.slug }, body),
  },

  // ── proposed facts ──
  {
    method: "GET",
    path: "claims",
    needs: "write",
    summary:
      "Proposed facts waiting for a person to decide. ?status=accepted|rejected for past ones.",
    run: async ({ actor, query }) =>
      ok(await listClaims(actor, { status: query.get("status") ?? undefined })),
  },
  {
    method: "POST",
    path: "claims",
    needs: "write",
    summary:
      "Propose a fact for a person to accept or reject, instead of writing it straight in. Nothing changes until it is accepted.",
    fields:
      "statement (the fact in plain words), action (add_person|update_person|add_relationship|add_event|update_event|add_place|update_place), " +
      "args (what that action takes), document (id of the document it was read from), quote (the words it was read from), " +
      "confidence (0 to 1), agent (name of the model proposing)",
    run: async ({ actor, body }) => {
      const result = await proposeClaim(actor, {
        statement: asText(body.statement),
        action: asText(body.action),
        args: body.args,
        document: asText(body.document) || undefined,
        quote: asText(body.quote) || undefined,
        confidence: typeof body.confidence === "number" ? body.confidence : undefined,
        agent: asText(body.agent) || undefined,
      });
      if (!result.ok) return invalid(result);
      return ok({ claim: await getClaim(actor, result.id) }, 201);
    },
  },
  {
    method: "POST",
    path: "claims/:id/accept",
    needs: "write",
    summary: "Accept a proposed fact: make the change it describes and tie it to its source.",
    run: async ({ actor, params }) => {
      const result = await acceptClaim(actor, params.id);
      if (result.ok) return ok({ claim: result.claim });
      const error =
        result.status === 404 ? "not_found" : result.status === 409 ? "decided" : "invalid";
      return {
        status: result.status,
        body: { error, message: result.message, fields: result.fields ?? {} },
      };
    },
  },
  {
    method: "POST",
    path: "claims/:id/reject",
    needs: "write",
    summary: "Reject a proposed fact. Nothing else changes.",
    fields: "note (optional: why)",
    run: async ({ actor, params, body }) => {
      const result = await rejectClaim(actor, params.id, asText(body.note) || undefined);
      if (result.ok) return ok({ claim: result.claim });
      return {
        status: result.status,
        body: { error: result.status === 404 ? "not_found" : "decided", message: result.message },
      };
    },
  },

  // ── bulk arrivals ──
  {
    method: "GET",
    path: "ingest/batches",
    needs: "write",
    summary: "Every batch of files brought in, newest first, with how many photos await review.",
    run: async ({ actor }) => ok({ batches: await listBatches(actor) }),
  },
  {
    method: "POST",
    path: "ingest/batches",
    needs: "ingest",
    summary:
      "Start a batch, or pick up your unfinished one with the same label. Says how to upload here.",
    fields: "label, source (folder|scan|facebook_export|facebook_capture; default folder)",
    run: async ({ actor, body }) => {
      const result = await openBatch(actor, {
        label: asText(body.label),
        source: asText(body.source),
      });
      if (!result.ok) return invalid(result);
      const { batch, resumed, upload } = result;
      return ok({ batch, resumed, upload }, resumed ? 200 : 201);
    },
  },
  {
    method: "GET",
    path: "ingest/batches/:id",
    needs: "write",
    summary: "One batch: the photos waiting for review and the files that failed.",
    run: async ({ actor, params }) => {
      const batch = await getBatch(actor, params.id);
      return batch ? ok({ batch }) : missing("batch");
    },
  },
  {
    method: "POST",
    path: "ingest/batches/:id/items",
    needs: "ingest",
    summary:
      "One file of a batch. Send its hash first: the answer is `duplicate` or `upload`. " +
      "After uploading the original, send again with `key` to make the photo.",
    fields:
      "sha256, filename, kind (photo|document; default photo), key (of the uploaded original), " +
      "sidecar ({ caption, date, photographer, people (names or slugs), album (title), sourceUrl, note; " +
      "for a document: title, kind (letter|record|recipe|story|article|other), date })",
    run: async ({ actor, params, body }) => {
      const result = await addItem(actor, params.id, {
        sha256: asText(body.sha256),
        filename: asText(body.filename) || undefined,
        key: asText(body.key) || undefined,
        kind: asText(body.kind) || undefined,
        sidecar: body.sidecar,
      });
      if (!result.ok) {
        const error =
          result.status === 404 ? "not_found" : result.status === 409 ? "finished" : "invalid";
        return { status: result.status, body: { error, message: result.message } };
      }
      const { state, photoId, documentId, problems } = result;
      return ok({ state, photoId, documentId, problems });
    },
  },
  {
    method: "POST",
    path: "ingest/batches/:id/complete",
    needs: "ingest",
    summary: "Say that no more files are coming. The photos stay in the review queue.",
    run: async ({ actor, params }) => {
      const batch = await completeBatch(actor, params.id);
      return batch ? ok({ batch }) : missing("batch");
    },
  },
  {
    method: "POST",
    path: "ingest/batches/:id/publish",
    needs: "write",
    summary:
      "Let the family see what waits in a batch: all of it, or only the photos and documents in `photos`.",
    fields: "photos (optional list of photo or document ids)",
    run: async ({ actor, params, body }) => {
      if (!(await getBatch(actor, params.id))) return missing("batch");
      const published = await publishPhotos(
        actor,
        params.id,
        "photos" in body ? asList(body.photos) : undefined,
      );
      return ok({ published, batch: await getBatch(actor, params.id) });
    },
  },
  {
    method: "POST",
    path: "ingest/batches/:id/discard",
    needs: "write",
    summary:
      "Throw out waiting photos or documents from a batch. Published ones are never touched.",
    fields: "photos (list of photo or document ids)",
    run: async ({ actor, params, body }) => {
      if (!(await getBatch(actor, params.id))) return missing("batch");
      const discarded = await discardPhotos(actor, params.id, asList(body.photos));
      return ok({ discarded, batch: await getBatch(actor, params.id) });
    },
  },
  {
    method: "POST",
    path: "ingest/batches/:id/date",
    needs: "write",
    summary: "Give the same date to several waiting photos of a batch.",
    fields: 'photos (list of photo ids), date (text, e.g. "1974" or "around 1974")',
    run: async ({ actor, params, body }) => {
      if (!(await getBatch(actor, params.id))) return missing("batch");
      const result = await datePhotos(actor, params.id, asList(body.photos), asText(body.date));
      if (!result.ok) return invalid({ errors: { date: result.message } });
      return ok({ dated: result.count, batch: await getBatch(actor, params.id) });
    },
  },
];

/** What `GET /api/v1` answers: which chest this is, what the caller may do, and every route. */
export function describeApi(actor: Actor, can: (permission: Permission) => boolean) {
  const chest = getChestConfig();
  return {
    chest: { name: chest.name, slug: chest.slug, environment: chest.env },
    caller: actor.kind === "apiKey" ? { kind: "apiKey", scopes: actor.scopes } : { kind: "user" },
    notes: [
      "Send JSON. Dates are text, as a person would write them: 1967-12-14, 1989, around 1964.",
      "People and places are addressed by slug; events, photos and albums by id.",
      "A 422 answer lists the problem under `fields`, keyed by field name.",
    ],
    routes: ROUTES.map((route) => ({
      method: route.method,
      path: `/api/v1/${route.path}`,
      summary: route.summary,
      ...(route.fields ? { fields: route.fields } : {}),
      allowed: can(route.needs),
    })),
  };
}
