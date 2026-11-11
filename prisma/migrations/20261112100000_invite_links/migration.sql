-- Invites are links the admin sends by hand. The token is kept so the same
-- link can be copied again later; it cannot sign anyone in on its own, because
-- the code still goes to the invited phone. Email is contact information only.
ALTER TABLE "invites" ADD COLUMN "token" TEXT,
ADD COLUMN "email" TEXT;

ALTER TABLE "users" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");
