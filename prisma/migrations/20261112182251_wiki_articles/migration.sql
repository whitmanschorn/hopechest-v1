-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "person_id" UUID,
    "search_vector" tsvector,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_revisions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "author_user_id" UUID,
    "author_api_key_id" UUID,
    "author_label" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "articles_person_id_key" ON "articles"("person_id");

-- CreateIndex
CREATE INDEX "articles_search_vector_idx" ON "articles" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "article_revisions_article_id_created_at_idx" ON "article_revisions"("article_id", "created_at");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_author_api_key_id_fkey" FOREIGN KEY ("author_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep articles.search_vector in step with title and body (title weighs more).
CREATE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, body ON "articles"
  FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();
