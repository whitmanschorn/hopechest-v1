-- "View as": an admin outside production can look at the chest as another
-- family member. The choice lives on the session, so signing out ends it.
ALTER TABLE "sessions" ADD COLUMN "acting_person_id" UUID,
ADD COLUMN "acting_role" "Role";

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_acting_person_id_fkey" FOREIGN KEY ("acting_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
