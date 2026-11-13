# Faces

The chest finds the faces in its photos, groups the ones that look alike, and asks a person who
they are. One answer names a whole group, and every name makes the next guess better. Nothing is
ever named by the machine alone.

## How it works

1. **Scan.** `hopechest scan-faces` runs on your own computer. For each photo not yet looked over
   it downloads the viewing copy, finds the faces, and sends back where each one is and 128
   numbers that describe it (an "embedding"). The model is `@vladmandic/face-api` with
   TensorFlow's WebAssembly backend: about a quarter of a second per photo on a laptop, no
   graphics card, no account anywhere. No photo is sent to any outside service.
2. **Group.** Under Review, **Who is this?** shows the unnamed faces, sorted into groups that are
   probably one person each, biggest first.
3. **Name.** Pick who it is and the whole group is named: each face becomes a tag on its photo,
   with the face's place in the picture. A face that does not belong can be clicked out first.
4. **Guess.** From then on, an unnamed face close to named ones comes with a guess ("Looks like
   Lucille Bluth") and one click confirms it. "No" means that person is never offered for that
   face again. "Nobody to name" sets a stranger or a statue aside for good.

A photo's own page says when it has unnamed faces, with a link to name just those.

## The command

```
hopechest [--env staging] scan-faces [limit=<how many photos>] [photo=<id>]
```

It needs a key with bulk-upload access. It can be stopped and run again: photos already looked
over are skipped, including the ones with no faces in them. With `photo=` it looks over one photo
again. Run it after bringing in new photos.

Scanning again never undoes a decision. Faces that were named, ruled on or set aside are kept;
only the undecided ones are replaced.

## Where guesses come from

- **Named faces nearby.** The nearest named faces vote (`pickPerson` in `src/lib/faces/group.ts`).
  The search uses the vector index over named faces, one query for a whole page.
- **Tags.** Before anyone has been named there is nothing to compare with. So when most of a
  group's photos are tagged with one person whose face has not been pointed out, that person is
  offered ("is tagged in these photos"). Each person is offered for one group only. In photos
  with several faces this guess can land on the wrong group; answering "No" moves it on.
- **Boxes drawn by hand.** A tag with a box drawn around a face names the face under it at scan
  time, with no question asked: a person already said who that is.

Removing someone's tag from a photo takes their name off the face too.

## The numbers

All in `src/lib/faces/model.ts`.

| Setting            | Value | Meaning                                                        |
| ------------------ | ----- | -------------------------------------------------------------- |
| `GROUP_DISTANCE`   | 0.5   | Two faces closer than this are grouped                         |
| `MATCH_DISTANCE`   | 0.55  | An unnamed face this close to a named one is offered that name |
| `MIN_SCORE`        | 0.7   | The detector is at least this sure, or the face is dropped     |
| `MIN_FACE_PERCENT` | 3     | Smaller than this share of the photo's long side is too small  |

These were set on a small sample of cast photos from Wikimedia Commons (below): the same person
in different photos was typically 0.2 to 0.6 apart, different people 0.8 and up. That is modern,
sharp, colour photography. Old scans will be harder: an earlier experiment on public-domain
portraits found same-person and different-person distances overlapping around 0.6. **Check these
numbers on real family scans before trusting guesses on a family site.** Because every name is
confirmed by a person, a loose setting costs clicks, not wrong names.

Changing the model means changing `FACE_MODEL`. Every photo then counts as not looked over, the
next scan replaces the undecided faces, and vectors from the old model are never compared with
the new.

## Trying it on staging with the Bluths

The seed's photos are screencaps. To have faces that really recur, bring in freely licensed
photos of the cast from Wikimedia Commons:

```
node scripts/bluth-cast-photos.ts ~/bluth-cast          # up to 80 pictures, each with a sidecar
hopechest --env staging ingest ~/bluth-cast --label "Cast photos"
# publish the batch under Review, then:
hopechest --env staging scan-faces
```

Each sidecar tags the character the actor plays and records the photographer, licence and
Commons page. The folder must be outside the repository; the pictures are never committed.
Commons limits how fast files can be fetched and makes the script pause, so the download can
take half an hour. It can be stopped and run again; pictures already fetched are kept.

Jeffrey Tambor plays both George Sr. and Oscar, so the chest cannot tell those two apart by
face. That is what will happen with real twins, and why a person always confirms.

## For programs

| Route                   | What                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `GET faces/unscanned`   | Photos to look over, the model's name, how many remain          |
| `POST photos/:id/faces` | What a scan found in one photo                                  |
| `GET faces`             | The unnamed faces in groups, with guesses (`?photo=`, `?page=`) |
| `POST faces/name`       | These faces are this person                                     |
| `POST faces/reject`     | These faces are not this person                                 |
| `POST faces/ignore`     | Nobody to name                                                  |

Assistants get the last four as tools (`list_unnamed_faces`, `name_faces`, `rule_out_faces`,
`set_faces_aside`). An assistant cannot tell who a face is from the queue alone; the tools are
for carrying out what a person has said.

## Limits

- Grouping is worked out afresh on each visit, over the newest 2,000 unnamed faces. Past that,
  older faces wait until newer ones are named.
- Groups chain: A near B and B near C puts all three together, so a group now and then holds two
  people. Click the odd ones out before naming.
- Faces in photos still waiting for review are scanned but not shown in the queue until the
  photo is published (they do show from the photo's own page).
- Detection runs only in the command-line tool. A photo uploaded on the website has no faces
  until the next `scan-faces`. Finding faces in the browser at upload is a later step.
- Profile faces, small faces and very old or damaged prints are often missed or grouped badly.
