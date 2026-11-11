// Guards for anything that writes freely or erases: development, specs and the
// reset and pull commands may only ever reach a database on this machine.
// No imports, so scripts can load it with plain node.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return /^postgres(ql)?:$/.test(parsed.protocol) && LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** The host of a database URL, for messages. Never includes the password. */
export function databaseHost(url: string | undefined): string {
  if (!url) return "(none)";
  try {
    return new URL(url).hostname || "(none)";
  } catch {
    return "(unreadable)";
  }
}
