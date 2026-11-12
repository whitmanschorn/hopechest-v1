import { execFile } from "node:child_process";

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
  /** What it printed, read as JSON (null if it was not JSON). */
  // Answers are free-form JSON; each test asserts on the shape it expects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

/**
 * Runs the real command-line tool as its own process, pointed at the server
 * under test as a deployment called "spec".
 */
export function hopechest(baseURL: string, key: string | null, ...args: string[]): Promise<Run> {
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOPECHEST_TARGET: "spec",
    HOPECHEST_SPEC_URL: baseURL,
    ...(key ? { HOPECHEST_SPEC_API_KEY: key } : {}),
  };
  return new Promise((resolve) => {
    execFile(
      "./cli/hopechest.ts",
      args,
      { env: env as NodeJS.ProcessEnv },
      (error, stdout, stderr) => {
        let json = null;
        try {
          json = JSON.parse(stdout);
        } catch {
          // Help text, or nothing.
        }
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout, stderr, json });
      },
    );
  });
}
