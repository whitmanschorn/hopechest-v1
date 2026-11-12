"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseStoredCrop } from "@/lib/people/avatarCrop";
import { requireActor } from "@/server/auth/session";
import { removeProfilePicture, setProfilePicture } from "@/server/people/picture";

const after = (slug: string, welcome: boolean) => (welcome ? "/home" : `/people/${slug}`);

/** Saves the square the browser cut out. Returns a message only when it fails. */
export async function savePictureAction(
  slug: string,
  welcome: boolean,
  form: FormData,
): Promise<{ message: string }> {
  const actor = await requireActor("read");
  const image = form.get("image");
  if (!(image instanceof File)) return { message: "Choose a picture first." };
  let crop: unknown = null;
  try {
    crop = JSON.parse(String(form.get("crop") ?? "null"));
  } catch {
    // A crop that cannot be read is simply not remembered.
  }
  const result = await setProfilePicture(actor, slug, {
    image: Buffer.from(await image.arrayBuffer()),
    photoId: String(form.get("photoId") ?? "") || null,
    crop: parseStoredCrop(crop),
  });
  if (!result.ok) return { message: result.message };
  // The picture shows in the page header too.
  revalidatePath("/", "layout");
  redirect(after(slug, welcome));
}

export async function removePictureAction(slug: string): Promise<void> {
  const actor = await requireActor("read");
  await removeProfilePicture(actor, slug);
  revalidatePath("/", "layout");
  redirect(`/people/${slug}`);
}
