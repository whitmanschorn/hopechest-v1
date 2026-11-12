import { z } from "zod";
import type { ApiRoute } from "@/server/api/routes";

/**
 * The tools an assistant gets over MCP. Each is one route of the REST API
 * (src/server/api/routes.ts) with a described input, so the two never drift:
 * a tool does exactly what its route does, with the same permission checks.
 */
export interface McpTool {
  name: string;
  title: string;
  description: string;
  /** "<METHOD> <path>" of the route it runs. */
  route: `${ApiRoute["method"]} ${string}`;
  input: z.ZodRawShape;
}

const slug = (what: string) => z.string().describe(`Slug of ${what}, e.g. "lucille"`);
const id = (what: string) => z.string().describe(`Id of ${what} (a UUID)`);
const date = (what: string) =>
  z
    .string()
    .optional()
    .describe(`${what}, as a person would write it: "1967-12-14", "1989", "around 1964"`);

const personFields = {
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  birthFamilyName: z.string().optional().describe("Family name at birth, if it changed"),
  nicknames: z.array(z.string()).optional(),
  alternateNames: z.array(z.string()).optional().describe("Other names they are known by"),
  gender: z.enum(["female", "male", "other"]).optional(),
  living: z.boolean().optional(),
  born: date("Date of birth"),
  died: date("Date of death"),
  notes: z.string().optional(),
};

const relationFields = {
  role: z
    .enum(["parent", "child", "partner"])
    .describe("What the OTHER person is to this one: their parent, their child or their partner"),
  other: slug("the other person"),
  qualifier: z
    .enum(["biological", "adoptive", "step", "foster", "legal", "married", "partnered"])
    .describe(
      "Parent or child: biological, adoptive, step, foster or legal. Partner: married or partnered",
    ),
  endReason: z
    .enum(["divorce", "separation", "annulment", "death", "other"])
    .optional()
    .describe("For a partnership that ended, how"),
};

const eventKind = z.enum([
  "birth",
  "death",
  "marriage",
  "divorce",
  "move",
  "immigration",
  "military",
  "education",
  "work",
  "other",
]);
const participants = z
  .array(
    z.object({
      person: slug("someone who took part"),
      role: z
        .enum(["subject", "parent", "child", "officiant", "witness", "other"])
        .optional()
        .describe('Defaults to "subject": the people the event is about'),
    }),
  )
  .describe("A marriage or divorce needs two subjects; a birth or death needs one");
const eventFields = {
  description: z.string().optional(),
  date: date("When it happened"),
  deduced: z
    .boolean()
    .optional()
    .describe("True when the date was worked out from other facts rather than read off a record"),
  clue: z.string().optional().describe("For a deduced date, how it was worked out"),
  place: z.string().optional().describe("Slug of where it happened"),
};

const placeFields = {
  street: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional().describe("State, province or county"),
  country: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().optional(),
};

export const TOOLS: readonly McpTool[] = [
  // ── reading ──
  {
    name: "find_people",
    title: "Find people",
    description:
      "List everyone in the family chest, or search by any of a person's names. Start here to get the slug other tools take.",
    route: "GET people",
    input: {
      q: z.string().optional().describe("Part of a name or nickname; leave out for everyone"),
    },
  },
  {
    name: "get_person",
    title: "Get a person",
    description:
      "Everything recorded about one person: names, birth and death, parents, partners, children, siblings and life events.",
    route: "GET people/:slug",
    input: { slug: slug("the person") },
  },
  {
    name: "resolve_kin",
    title: "Resolve family words",
    description:
      'Work out who family words mean for a given person. For George Michael, "grandma and grandpa" are Lucille and George Sr. Use this before answering any question phrased with words like mom, grandpa, aunt or cousin.',
    route: "GET kin",
    input: {
      person: slug("the person whose point of view it is (usually whoever is asking)"),
      words: z.string().describe('The words or the whole question, e.g. "grandma and grandpa"'),
    },
  },
  {
    name: "list_events",
    title: "List events",
    description:
      'Dated events in the family\'s history, in order. To answer "when were X and Y married?", list marriages for one of them and pick the event both took part in.',
    route: "GET events",
    input: {
      kind: eventKind.optional(),
      person: z.string().optional().describe("Slug of someone who took part"),
      place: z.string().optional().describe("Slug of where it happened"),
    },
  },
  {
    name: "get_event",
    title: "Get an event",
    description:
      "One event with its participants, place, date (and whether the date was deduced) and the sources that back it up. Cite the sources when you answer from it.",
    route: "GET events/:id",
    input: { id: id("the event") },
  },
  {
    name: "get_document",
    title: "Read a document",
    description:
      "The full text of a document in the chest, such as a marriage licence or a letter, with how to cite it. Source ids from get_event lead here.",
    route: "GET documents/:id",
    input: { id: id("the document") },
  },
  {
    name: "person_history",
    title: "Edit history of a person",
    description: "Who changed what on a person's record, newest first.",
    route: "GET people/:slug/history",
    input: { slug: slug("the person") },
  },
  {
    name: "list_places",
    title: "List places",
    description: "Every place in the chest, with its address and how many events happened there.",
    route: "GET places",
    input: {},
  },
  {
    name: "get_place",
    title: "Get a place",
    description: "One place.",
    route: "GET places/:slug",
    input: { slug: slug("the place") },
  },
  {
    name: "list_photos",
    title: "List photos",
    description:
      "Photos, newest upload first, 60 at a time. Give a person's slug for photos they are in.",
    route: "GET photos",
    input: {
      person: z.string().optional().describe("Slug of someone tagged in the photos"),
      before: z
        .string()
        .optional()
        .describe("The `next` value of the previous page, for older photos"),
    },
  },
  {
    name: "get_photo",
    title: "Get a photo",
    description:
      "One photo: caption, date, who is in it, the albums it is in, and its file addresses.",
    route: "GET photos/:id",
    input: { id: id("the photo") },
  },
  {
    name: "list_albums",
    title: "List albums",
    description: "Every album, with how many photos it holds.",
    route: "GET albums",
    input: {},
  },
  {
    name: "get_album",
    title: "Get an album",
    description: "One album and its photos, in order.",
    route: "GET albums/:id",
    input: { id: id("the album") },
  },

  // ── changing ──
  {
    name: "add_person",
    title: "Add a person",
    description:
      "Add someone to the family. Search first so you do not add a person twice. Use `relation` to tie them to someone already in the chest.",
    route: "POST people",
    input: {
      displayName: z.string().describe("Their name as the family says it"),
      ...personFields,
      relation: z.object(relationFields).optional(),
    },
  },
  {
    name: "update_person",
    title: "Change a person",
    description: "Change details of a person. Only what you send is changed.",
    route: "PATCH people/:slug",
    input: { slug: slug("the person"), displayName: z.string().optional(), ...personFields },
  },
  {
    name: "add_relationship",
    title: "Link two people",
    description: "Record that two people already in the chest are parent and child, or partners.",
    route: "POST people/:slug/relationships",
    input: { slug: slug("this person"), ...relationFields },
  },
  {
    name: "remove_relationship",
    title: "Unlink two people",
    description:
      "Remove a parent, child or partner link. The id is `relationshipId` on a relative returned by get_person.",
    route: "DELETE relationships/:id",
    input: { id: id("the relationship") },
  },
  {
    name: "add_event",
    title: "Record an event",
    description:
      "Record something that happened: a marriage, a move, military service. If the date is worked out rather than read off a record, set `deduced` and say how in `clue`.",
    route: "POST events",
    input: { kind: eventKind, title: z.string(), ...eventFields, participants },
  },
  {
    name: "update_event",
    title: "Change an event",
    description:
      "Change an event. Only what you send is changed; `participants`, when sent, replaces the whole list.",
    route: "PATCH events/:id",
    input: {
      id: id("the event"),
      kind: eventKind.optional(),
      title: z.string().optional(),
      ...eventFields,
      participants: participants.optional(),
    },
  },
  {
    name: "delete_event",
    title: "Delete an event",
    description: "Delete an event. This cannot be undone.",
    route: "DELETE events/:id",
    input: { id: id("the event") },
  },
  {
    name: "add_place",
    title: "Add a place",
    description:
      "Add a place events can happen at. Check list_places first so it is not added twice.",
    route: "POST places",
    input: {
      label: z.string().describe('What the family calls it, e.g. "The model home"'),
      ...placeFields,
    },
  },
  {
    name: "update_place",
    title: "Change a place",
    description: "Change a place. Only what you send is changed.",
    route: "PATCH places/:slug",
    input: { slug: slug("the place"), label: z.string().optional(), ...placeFields },
  },
  {
    name: "delete_place",
    title: "Delete a place",
    description: "Delete a place. Events that happened there are kept and lose their place.",
    route: "DELETE places/:slug",
    input: { slug: slug("the place") },
  },
  {
    name: "update_photo",
    title: "Change a photo's details",
    description:
      "Caption a photo, date it, say who took it, who is in it and which albums it belongs in. `people` and `albums`, when sent, replace the whole list.",
    route: "PATCH photos/:id",
    input: {
      id: id("the photo"),
      caption: z.string().optional(),
      date: date("When it was taken"),
      photographer: z.string().optional(),
      people: z.array(z.string()).optional().describe("Slugs of everyone in the photo"),
      albums: z.array(z.string()).optional().describe("Ids of the albums it belongs in"),
    },
  },
  {
    name: "add_album",
    title: "Make an album",
    description: "Make an empty album. Put photos in it with update_photo.",
    route: "POST albums",
    input: { title: z.string(), description: z.string().optional() },
  },
  {
    name: "update_album",
    title: "Change an album",
    description: "Rename an album, describe it, or choose its cover photo.",
    route: "PATCH albums/:id",
    input: {
      id: id("the album"),
      title: z.string().optional(),
      description: z.string().optional(),
      cover: z.string().optional().describe("Id of a photo in the album"),
    },
  },
  {
    name: "delete_album",
    title: "Delete an album",
    description: "Delete an album. Its photos stay in the chest.",
    route: "DELETE albums/:id",
    input: { id: id("the album") },
  },

  // ── reviewing bulk arrivals ──
  {
    name: "list_ingest_batches",
    title: "List batches of arrivals",
    description:
      "Batches of files brought in in bulk (a box of slide scans, a Facebook export), newest first, with how many photos in each still wait for review before the family can see them.",
    route: "GET ingest/batches",
    input: {},
  },
  {
    name: "get_ingest_batch",
    title: "Get a batch",
    description:
      "One batch: its photos waiting for review, with what could not be applied from the details that came with each file, and the files that failed. Caption or tag a waiting photo with update_photo.",
    route: "GET ingest/batches/:id",
    input: { id: id("the batch") },
  },
  {
    name: "date_ingest_photos",
    title: "Date waiting photos",
    description:
      'Give the same date to several waiting photos of a batch, e.g. "everything in this box is from 1974".',
    route: "POST ingest/batches/:id/date",
    input: {
      id: id("the batch"),
      photos: z.array(z.string()).describe("Ids of the waiting photos"),
      date: z.string().describe('The date as a person would write it: "1974", "around 1974"'),
    },
  },
  {
    name: "publish_ingest_photos",
    title: "Publish waiting photos",
    description:
      "Let the family see a batch's waiting photos. Leave `photos` out to publish all of them. Only do this when the person you are helping has asked for it.",
    route: "POST ingest/batches/:id/publish",
    input: {
      id: id("the batch"),
      photos: z.array(z.string()).optional().describe("Ids of the photos; leave out for all"),
    },
  },
];
