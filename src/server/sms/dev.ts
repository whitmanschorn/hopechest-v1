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
    // Any live code for the number is accepted, not only the newest, so asking
    // twice (or two specs sharing a test number) does not cancel the first code.
    const live = await db.verificationCode.findMany({
      where: {
        phone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_GUESSES },
      },
    });
    const match = live.find((row) => hashesMatch(row.codeHash, hashToken(code)));
    if (!match) {
      await db.verificationCode.updateMany({
        where: { id: { in: live.map((row) => row.id) } },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }
    // Guarded on consumedAt so the same code cannot be used twice at once.
    const used = await db.verificationCode.updateMany({
      where: { id: match.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return used.count === 1;
  },
  async sendMessage(_phone, body) {
    return { devBody: body };
  },
};
