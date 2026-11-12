import { asList, asText, mergeText } from "@/lib/api/match";
import { getChestConfig } from "@/lib/chest";
import { dateToText, toEventFormInput, type EventFormInput } from "@/lib/events/eventEdit";
import { toFormInput, type PersonFormInput } from "@/lib/people/personEdit";
import { toPlaceFormInput, type PlaceFormInput } from "@/lib/places/placeEdit";
import type { Actor, Permission } from "@/server/actor";
import {
  createAlbum,
  deleteAlbum,
  getAlbum,
  listAlbums,
  updateAlbum,
} from "@/server/albums/service";
import { getDocument } from "@/server/documents/service";
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
    path: "documents/:id",
    needs: "read",
    summary: "One document: its title, kind, date, full text and how to cite it.",
    run: async ({ actor, params }) => {
      const document = await getDocument(actor, params.id);
      return document ? ok({ document }) : missing("document");
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
