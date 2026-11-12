-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('PERSON', 'PLACE', 'EVENT', 'TOPIC', 'ORGANIZATION', 'GROUP', 'THING', 'ANIMAL');

-- CreateEnum
CREATE TYPE "PredicateValueType" AS ENUM ('ENTITY', 'TEXT', 'DATE', 'NUMBER');

-- CreateEnum
CREATE TYPE "StatementRank" AS ENUM ('PREFERRED', 'NORMAL', 'DEPRECATED');

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "EntityKind" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "person_id" UUID,
    "place_id" UUID,
    "event_id" UUID,
    "article_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predicates" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "inverse_label" TEXT,
    "description" TEXT,
    "value_type" "PredicateValueType" NOT NULL,
    "subject_kinds" "EntityKind"[],
    "object_kinds" "EntityKind"[],
    "symmetric" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predicates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "statements" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "predicate" TEXT NOT NULL,
    "object_id" UUID,
    "value_text" TEXT,
    "value_number" DOUBLE PRECISION,
    "value_date" TEXT,
    "from_date" TEXT,
    "until_date" TEXT,
    "sort_key" INTEGER,
    "note" TEXT,
    "rank" "StatementRank" NOT NULL DEFAULT 'NORMAL',
    "source_id" UUID,
    "quote" TEXT,
    "created_by_user_id" UUID,
    "created_by_api_key_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_key_key" ON "entities"("key");

-- CreateIndex
CREATE UNIQUE INDEX "entities_person_id_key" ON "entities"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "entities_place_id_key" ON "entities"("place_id");

-- CreateIndex
CREATE UNIQUE INDEX "entities_event_id_key" ON "entities"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "entities_article_id_key" ON "entities"("article_id");

-- CreateIndex
CREATE INDEX "entities_kind_name_idx" ON "entities"("kind", "name");

-- CreateIndex
CREATE INDEX "statements_subject_id_predicate_idx" ON "statements"("subject_id", "predicate");

-- CreateIndex
CREATE INDEX "statements_object_id_predicate_idx" ON "statements"("object_id", "predicate");

-- CreateIndex
CREATE INDEX "statements_predicate_idx" ON "statements"("predicate");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_created_by_api_key_id_fkey" FOREIGN KEY ("created_by_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every person, place, event and wiki topic page is a node of the graph.
-- (Events added on the website have no slug; their node is keyed by id.)
-- Triggers keep `entities` in step, so no code path can forget to.
CREATE FUNCTION entities_sync_person() RETURNS trigger AS $$
BEGIN
  INSERT INTO "entities" ("kind", "key", "name", "person_id")
  VALUES ('PERSON', 'person:' || NEW.slug, NEW.display_name, NEW.id)
  ON CONFLICT ("person_id") DO UPDATE SET "key" = EXCLUDED."key", "name" = EXCLUDED."name";
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER entities_person_trigger
  AFTER INSERT OR UPDATE OF slug, display_name ON "people"
  FOR EACH ROW EXECUTE FUNCTION entities_sync_person();

CREATE FUNCTION entities_sync_place() RETURNS trigger AS $$
BEGIN
  INSERT INTO "entities" ("kind", "key", "name", "place_id")
  VALUES ('PLACE', 'place:' || NEW.slug, NEW.label, NEW.id)
  ON CONFLICT ("place_id") DO UPDATE SET "key" = EXCLUDED."key", "name" = EXCLUDED."name";
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER entities_place_trigger
  AFTER INSERT OR UPDATE OF slug, label ON "places"
  FOR EACH ROW EXECUTE FUNCTION entities_sync_place();

CREATE FUNCTION entities_sync_event() RETURNS trigger AS $$
BEGIN
  INSERT INTO "entities" ("kind", "key", "name", "event_id")
  VALUES ('EVENT', 'event:' || COALESCE(NEW.slug, NEW.id::text), NEW.title, NEW.id)
  ON CONFLICT ("event_id") DO UPDATE SET "key" = EXCLUDED."key", "name" = EXCLUDED."name";
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER entities_event_trigger
  AFTER INSERT OR UPDATE OF slug, title ON "events"
  FOR EACH ROW EXECUTE FUNCTION entities_sync_event();

-- A person's own wiki page belongs to the person's node; only topic pages get
-- a node. Its kind (topic, organization, thing...) is chosen by the family and
-- is left alone when the page is renamed.
CREATE FUNCTION entities_sync_article() RETURNS trigger AS $$
BEGIN
  IF NEW.person_id IS NULL THEN
    INSERT INTO "entities" ("kind", "key", "name", "article_id")
    VALUES ('TOPIC', 'page:' || NEW.slug, NEW.title, NEW.id)
    ON CONFLICT ("article_id") DO UPDATE SET "key" = EXCLUDED."key", "name" = EXCLUDED."name";
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER entities_article_trigger
  AFTER INSERT OR UPDATE OF slug, title ON "articles"
  FOR EACH ROW EXECUTE FUNCTION entities_sync_article();

-- Nodes for everything that is already there.
INSERT INTO "entities" ("kind", "key", "name", "person_id")
  SELECT 'PERSON', 'person:' || slug, display_name, id FROM "people";
INSERT INTO "entities" ("kind", "key", "name", "place_id")
  SELECT 'PLACE', 'place:' || slug, label, id FROM "places";
INSERT INTO "entities" ("kind", "key", "name", "event_id")
  SELECT 'EVENT', 'event:' || COALESCE(slug, id::text), title, id FROM "events";
INSERT INTO "entities" ("kind", "key", "name", "article_id")
  SELECT 'TOPIC', 'page:' || slug, title, id FROM "articles" WHERE person_id IS NULL;

-- A fact points at a node or carries a value, never both and never neither.
ALTER TABLE "statements" ADD CONSTRAINT "statements_one_value_check"
  CHECK (num_nonnulls("object_id", "value_text", "value_number", "value_date") = 1);
ALTER TABLE "statements" ADD CONSTRAINT "statements_not_self_check"
  CHECK ("object_id" IS NULL OR "object_id" <> "subject_id");
