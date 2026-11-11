/**
 * Phone numbers are stored and compared in E.164 form ("+14155550123").
 * Numbers typed without a country code are read as US/Canada.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "+14155550123" -> "(415) 555-0123"; other countries are shown as stored. */
export function formatPhone(phone: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : phone;
}

/** For screens and logs: "+14155550123" -> "•••• 0123". */
export function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}

/**
 * Numbers in the 555-0100 to 555-0199 range are reserved for fiction and can
 * never belong to a real person, so they are safe as built-in test numbers.
 */
export function isFictionalPhone(phone: string): boolean {
  return /^\+1\d{3}55501\d{2}$/.test(phone);
}

/** Parses a comma- or space-separated list from an environment variable. */
export function parsePhoneList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map(normalizePhone)
    .filter((phone): phone is string => phone !== null);
}
