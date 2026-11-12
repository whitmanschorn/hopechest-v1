# Bringing photos in from Facebook

Two ways, both ending in the same place: a folder of pictures with a JSON sidecar beside each
(`docs/ingest.md`), which `hopechest ingest` sends for review. Nothing reaches the family until
someone publishes the batch.

| Way                    | Good for                                               | Gets                                    |
| ---------------------- | ------------------------------------------------------ | --------------------------------------- |
| Facebook's own export  | Everything you posted yourself                         | Full-size files, albums, captions, tags |
| Capture in the browser | Photos other people posted, groups, a relative's album | What is on the page, as shown           |

Prefer the export where it applies: it is complete, and it is your own data handed over by
Facebook.

## 1. Facebook's export

1. On Facebook: **Settings → Accounts Center → Your information and permissions → Download your
   information**. Choose your profile, "Specific types of information", and tick **Posts** (which
   holds photos and albums). Format **JSON**, media quality **High**, date range **All time**.
2. When Facebook emails that it is ready, download the zip files and unzip them into one folder.
3. Convert it:

   ```
   hopechest facebook-export ~/Downloads/facebook-yourname --out ~/Scans/from-facebook
   ```

   This sends nothing anywhere. It copies each photo into a sub-folder per album and writes its
   sidecar: the caption or the words of the post, the album, the people tagged, and the camera's
   date if Facebook kept one. The report lists photos the export mentions but does not contain.

4. Look the folder over. Delete what does not belong in a family archive; correct sidecars if you
   like.
5. Ingest it, then review on the website:

   ```
   hopechest --env staging ingest ~/Scans/from-facebook --label "Facebook export" --source facebook_export
   ```

What to expect:

- **Dates.** The day a photo was posted is not the day it was taken; an old print scanned and
  posted in 2014 is not from 2014. So only the camera's date is used as the photo's date. The
  posting day is kept as a note the reviewer sees ("Posted on Facebook, 3 June 2014").
- **People.** Tags are names as Facebook has them. They become tags here only when the name
  matches exactly one person in the chest; otherwise the reviewer sees a note. Adding a relative's
  Facebook name under "Other names" on their page before ingesting makes the match.
- **Albums.** Each Facebook album becomes an album. Facebook's catch-alls ("Timeline photos",
  "Mobile uploads") do not.
- **Left out on purpose:** videos, comments, and anything under Messenger conversations.
- **Accents and emoji** are repaired (Facebook's export garbles them).

The converter does not depend on Facebook's file names, which change every year or two: it reads
every JSON file and takes anything that points at a picture. It has been tested on files built to
match the current layout, not yet on a real export. If a real one comes out thin (few photos
found, or captions missing), that is a bug to report with the name of one affected JSON file.

## 2. Capturing in the browser, with Claude

For photos that are not yours to export: a cousin's album, a family group. You stay signed in to
Facebook in your own Chrome and watch; Claude (Claude Code with the Chrome extension) does the
clicking and writes the files. Facebook's terms restrict automated collection, so keep this to
family photos you can already see, at the pace of a person browsing, and stop if Facebook objects.

### Before starting

- Make a drop folder, for example `~/Scans/facebook-capture/<album-name>/`.
- Open the album or post in Chrome yourself, signed in as you.
- Start `claude` in this repository and say which page and which folder.

### What to ask Claude to do

Give it this procedure:

1. Work only in the tab I point you to. Do not sign in, change settings, message, react or
   comment. If Facebook shows a login page, a security check, or a warning, stop and tell me.
2. For each photo in the album, open it in the viewer and read: the caption, the names tagged, the
   album title, the date shown, and the address of the photo page.
3. Save the largest version of the image the page offers into the drop folder as
   `NNN.jpg` (001, 002, ...), using the browser's own download of the image.
4. Beside it write `NNN.json`:

   ```json
   {
     "caption": "the caption, exactly as written",
     "people": ["names as tagged"],
     "album": "the album's title",
     "sourceUrl": "the address of the photo page",
     "note": "Posted on Facebook by <name>, <date shown>."
   }
   ```

   Leave `date` out unless the caption itself says when the photo was taken. Do not guess people
   from faces. Leave a field out rather than invent it.

5. Go slowly: one photo at a time, a pause between photos, and stop after 50 in one sitting.
6. At the end, tell me how many were saved and any you could not open.

### Afterwards

Look through the folder, then:

```
hopechest --env staging ingest ~/Scans/facebook-capture/<album-name> \
  --label "Facebook: <album-name>" --source facebook_capture
```

Running it again later sends only what is new, so an album can be captured over several sittings.

This procedure has not been run end to end yet. The first real capture should be a small album,
watched throughout.
