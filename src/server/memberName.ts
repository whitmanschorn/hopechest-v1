import { maskPhone } from "@/lib/auth/phone";

/** How a member is named beside something they did: their name, else a masked number. */
export function memberName(
  user: { phone: string; person: { displayName: string } | null } | null,
): string {
  if (!user) return "Someone no longer here";
  if (user.person) return user.person.displayName;
  return user.phone === "demo-visitor" ? "A demo visitor" : maskPhone(user.phone);
}
