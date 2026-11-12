import { collectPhotos, fixText, folderName } from "../lib/facebookExport.ts";

describe("fixText", () => {
  it("puts back accents and emoji that Facebook spelled out byte by byte", () => {
    expect(fixText("CafÃ© with AnaÃ¯s")).toBe("Café with Anaïs");
    expect(fixText("ð\u009f\u008d\u008c stand")).toBe("🍌 stand");
  });

  it("leaves text that is already right", () => {
    expect(fixText("  Plain words ")).toBe("Plain words");
    expect(fixText("Café")).toBe("Café");
    expect(fixText("日本")).toBe("日本");
  });
});

describe("collectPhotos", () => {
  const album = {
    name: "Balboa Island, summer 1976",
    photos: [
      {
        uri: "your_facebook_activity/posts/media/Balboa_abc/1.jpg",
        creation_timestamp: 1401753600,
        title: "Balboa Island, summer 1976",
        description: "Opening day at the stand",
        media_metadata: { photo_metadata: { exif_data: [{ taken_timestamp: 205286400 }] } },
        comments: [{ comment: "Lovely!", attachments: [{ uri: "media/sticker.png" }] }],
      },
      {
        uri: "your_facebook_activity/posts/media/Balboa_abc/2.jpg",
        creation_timestamp: 1401753600,
      },
    ],
  };
  const posts = [
    {
      timestamp: 1262304000,
      data: [{ post: "Pop-Pop and Gangy at the cafÃ©" }],
      tags: [{ name: "George Bluth Sr." }, { name: "Lucille Bluth" }],
      attachments: [
        {
          data: [
            {
              media: {
                uri: "your_facebook_activity/posts/media/Timeline_xyz/3.jpg",
                creation_timestamp: 1262304000,
                title: "Timeline photos",
              },
            },
            { media: { uri: "your_facebook_activity/posts/media/videos/clip.mp4" } },
          ],
        },
      ],
    },
    // The first album photo again, as it appeared in a post, with nothing new.
    {
      timestamp: 1401753600,
      attachments: [
        { data: [{ media: { uri: "your_facebook_activity/posts/media/Balboa_abc/1.jpg" } }] },
      ],
    },
  ];

  it("finds each photo once, with its album, words, tags and dates", () => {
    expect(collectPhotos([posts, album])).toEqual([
      {
        uri: "your_facebook_activity/posts/media/Balboa_abc/1.jpg",
        sidecar: {
          caption: "Opening day at the stand",
          date: "1976-07-04",
          album: "Balboa Island, summer 1976",
          note: "Posted on Facebook, 3 June 2014.",
        },
      },
      {
        uri: "your_facebook_activity/posts/media/Balboa_abc/2.jpg",
        sidecar: { album: "Balboa Island, summer 1976", note: "Posted on Facebook, 3 June 2014." },
      },
      {
        uri: "your_facebook_activity/posts/media/Timeline_xyz/3.jpg",
        sidecar: {
          caption: "Pop-Pop and Gangy at the café",
          people: ["George Bluth Sr.", "Lucille Bluth"],
          note: "Posted on Facebook, 1 January 2010.",
        },
      },
    ]);
  });

  it("never dates a photo by the day it was posted", () => {
    const [, second, third] = collectPhotos([posts, album]);
    expect(second.sidecar.date).toBeUndefined();
    expect(third.sidecar.date).toBeUndefined();
  });

  it("makes nothing of files with no photos in them", () => {
    expect(collectPhotos([{ friends: [{ name: "Someone" }] }, "text", null, 3])).toEqual([]);
  });
});

describe("folderName", () => {
  it("makes a plain folder name from an album title", () => {
    expect(folderName("Balboa Island, summer 1976")).toBe("Balboa-Island-summer-1976");
    expect(folderName("Café ☕")).toBe("Cafe");
    expect(folderName(undefined)).toBe("no-album");
    expect(folderName("///")).toBe("no-album");
  });
});
