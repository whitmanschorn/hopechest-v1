import type { SmsProvider, TwilioConfig } from "./provider";

async function post(config: TwilioConfig, url: string, fields: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

/** Login codes through Twilio Verify; other texts through Programmable Messaging. */
export function twilioProvider(config: TwilioConfig): SmsProvider {
  const verify = `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}`;
  return {
    name: "twilio",
    async startVerification(phone) {
      const result = await post(config, `${verify}/Verifications`, { To: phone, Channel: "sms" });
      if (!result.ok) throw new Error(`Twilio Verify could not send a code (${result.status})`);
      return {};
    },
    async checkVerification(phone, code) {
      const result = await post(config, `${verify}/VerificationCheck`, { To: phone, Code: code });
      // 404 means no pending verification: expired, already used, or never sent.
      return result.ok && result.body.status === "approved";
    },
    async sendMessage(phone, body) {
      const sender: Record<string, string> | null = config.messagingServiceSid
        ? { MessagingServiceSid: config.messagingServiceSid }
        : config.fromNumber
          ? { From: config.fromNumber }
          : null;
      if (!sender) {
        throw new Error("Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER to send texts");
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
      const result = await post(config, url, { To: phone, Body: body, ...sender });
      if (!result.ok) throw new Error(`Twilio could not send the message (${result.status})`);
      return {};
    },
  };
}
