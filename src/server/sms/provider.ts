import { isFictionalPhone, parsePhoneList } from "@/lib/auth/phone";
import type { HopechestEnv } from "@/lib/chest";

export interface StartResult {
  /** Set only by the dev provider: the code, to show on screen. */
  devCode?: string;
}

/** Sends login codes and plain messages. Twilio in production; a database-backed
 * stand-in for test numbers everywhere else. */
export interface SmsProvider {
  readonly name: "twilio" | "dev";
  startVerification(phone: string): Promise<StartResult>;
  checkVerification(phone: string, code: string): Promise<boolean>;
  /** Returns the text for the dev provider to show instead of sending. */
  sendMessage(phone: string, body: string): Promise<{ devBody?: string }>;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
  /** One of these is needed for invite texts; codes work without either. */
  messagingServiceSid?: string;
  fromNumber?: string;
}

export interface SmsSettings {
  env: HopechestEnv;
  twilio: TwilioConfig | null;
  /** Numbers that get on-screen codes outside production. */
  testPhones: string[];
  /**
   * When set, test numbers sign in with this secret code and nothing is shown
   * on screen. Staging requires it, because its address is public.
   */
  testLoginCode: string | null;
}

export function readSmsSettings(
  env: HopechestEnv,
  source: Record<string, string | undefined> = process.env,
): SmsSettings {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = source;
  const twilio =
    TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID
      ? {
          accountSid: TWILIO_ACCOUNT_SID,
          authToken: TWILIO_AUTH_TOKEN,
          verifyServiceSid: TWILIO_VERIFY_SERVICE_SID,
          messagingServiceSid: source.TWILIO_MESSAGING_SERVICE_SID || undefined,
          fromNumber: source.TWILIO_FROM_NUMBER || undefined,
        }
      : null;
  const testLoginCode = /^\d{6}$/.test(source.TEST_LOGIN_CODE ?? "")
    ? source.TEST_LOGIN_CODE!
    : null;
  return { env, twilio, testPhones: parsePhoneList(source.TEST_PHONE_ALLOWLIST), testLoginCode };
}

/**
 * A test number: reserved-for-fiction, or listed in TEST_PHONE_ALLOWLIST.
 * Never in production, and on staging only when a secret code is configured.
 */
export function isTestPhone(settings: SmsSettings, phone: string): boolean {
  if (settings.env === "production") return false;
  if (settings.env === "staging" && !settings.testLoginCode) return false;
  return isFictionalPhone(phone) || settings.testPhones.includes(phone);
}

export type Route = "twilio" | "dev" | "unavailable";

/**
 * Which provider handles a number:
 *   - production: always Twilio. Codes are never shown on screen there.
 *   - staging: test numbers work only with the secret TEST_LOGIN_CODE.
 *   - elsewhere: test numbers get the dev provider; real numbers get Twilio if
 *     it is configured, and otherwise cannot sign in at all.
 */
export function routeFor(settings: SmsSettings, phone: string): Route {
  if (isTestPhone(settings, phone)) return "dev";
  return settings.twilio ? "twilio" : "unavailable";
}
