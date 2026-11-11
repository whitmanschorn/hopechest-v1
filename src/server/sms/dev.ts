import { hashesMatch, hashToken, randomCode } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db";
import type { SmsProvider } from "./provider";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_GUESSES = 5;

/**
 * Stand-in for test numbers outside production: the code is stored hashed and
 * handed back to be shown on screen. `routeFor` decides who gets this provider.
 */
export const devProvider: SmsProvider = {
  name: "dev",
  async startVerification(phone) {
    const code = randomCode();
    await getDb().verificationCode.create({
      data: { phone, codeHash: hashToken(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    });
    return { devCode: code };
  },
  async checkVerification(phone, code) {
    const db = getDb();
    const latest = await db.verificationCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!latest || latest.attempts >= MAX_GUESSES) return false;
    const correct = hashesMatch(latest.codeHash, hashToken(code));
    await db.verificationCode.update({
      where: { id: latest.id },
      data: correct ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
    });
    return correct;
  },
  async sendMessage(_phone, body) {
    return { devBody: body };
  },
};
