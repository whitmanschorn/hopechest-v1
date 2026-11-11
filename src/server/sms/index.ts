import { getChestConfig } from "@/lib/chest";
import { devProvider } from "./dev";
import { readSmsSettings, routeFor, type SmsProvider, type SmsSettings } from "./provider";
import { twilioProvider } from "./twilio";

export function getSmsSettings(): SmsSettings {
  return readSmsSettings(getChestConfig().env);
}

/** The provider for this number, or null when it cannot be texted here. */
export function smsProviderFor(phone: string, settings = getSmsSettings()): SmsProvider | null {
  const route = routeFor(settings, phone);
  if (route === "dev") return devProvider;
  if (route === "twilio" && settings.twilio) return twilioProvider(settings.twilio);
  return null;
}
