-- pgvector, for face embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('DAY', 'MONTH', 'YEAR', 'CIRCA');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('PARENT', 'PARTNER');

-- CreateEnum
CREATE TYPE "RelationshipQualifier" AS ENUM ('BIOLOGICAL', 'ADOPTIVE', 'STEP', 'FOSTER', 'LEGAL', 'MARRIED', 'PARTNERED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelationshipEndReason" AS ENUM ('DIVORCE', 'SEPARATION', 'ANNULMENT', 'DEATH', 'OTHER');

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'MOVE', 'IMMIGRATION', 'MILITARY', 'EDUCATION', 'WORK', 'OTHER');

-- CreateEnum
CREATE TYPE "EventRole" AS ENUM ('SUBJECT', 'PARENT', 'CHILD', 'OFFICIANT', 'WITNESS', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('DOCUMENT', 'PHOTO', 'MESSAGE', 'IMPORT', 'TESTIMONY', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('NEEDS_REVIEW', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('LETTER', 'RECORD', 'RECIPE', 'STORY', 'ARTICLE', 'OTHER');

-- CreateEnum
CREATE TYPE "IngestSource" AS ENUM ('UPLOAD', 'FOLDER', 'SCAN', 'FACEBOOK_EXPORT', 'FACEBOOK_CAPTURE');

-- CreateEnum
CREATE TYPE "IngestBatchStatus" AS ENUM ('OPEN', 'COMPLETE');

-- CreateEnum
CREATE TYPE "IngestItemKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "IngestItemStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('TEXT', 'VOICE');

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "given_name" TEXT,
    "family_name" TEXT,
    "birth_family_name" TEXT,
    "nicknames" TEXT[],
    "alternate_names" TEXT[],
    "gender" "Gender",
    "is_living" BOOLEAN,
    "notes" TEXT,
    "avatar_url" TEXT,
    "avatar_photo_id" UUID,
    "avatar_crop" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" UUID NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "from_person_id" UUID NOT NULL,
    "to_person_id" UUID NOT NULL,
    "qualifier" "RelationshipQualifier" NOT NULL DEFAULT 'UNKNOWN',
    "end_reason" "RelationshipEndReason",
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "street" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" TEXT,
    "kind" "EventKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "place_id" UUID,
    "date_year" INTEGER,
    "date_month" INTEGER,
    "date_day" INTEGER,
    "date_precision" "DatePrecision",
    "date_display" TEXT,
    "date_deduced" BOOLEAN NOT NULL DEFAULT false,
    "date_clue" TEXT,
    "date_sort_key" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "event_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role" "EventRole" NOT NULL DEFAULT 'SUBJECT',

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("event_id","person_id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "citation" TEXT NOT NULL,
    "url" TEXT,
    "document_id" UUID,
    "photo_id" UUID,
    "message_id" UUID,
    "ingest_batch_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PROPOSED',
    "statement" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source_id" UUID,
    "applied_type" TEXT,
    "applied_id" UUID,
    "created_by_user_id" UUID,
    "created_by_agent" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changelog" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "actor_user_id" UUID,
    "actor_api_key_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "changelog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "person_id" UUID,
    "onboarded_at" TIMESTAMPTZ,
    "disabled_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID,
    "sent_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_by_id" UUID,
    "last_used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "display_url" TEXT NOT NULL,
    "thumb_url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "original_filename" TEXT,
    "caption" TEXT,
    "photographer" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'PUBLISHED',
    "place_id" UUID,
    "uploaded_by_id" UUID,
    "exif" JSONB,
    "date_year" INTEGER,
    "date_month" INTEGER,
    "date_day" INTEGER,
    "date_precision" "DatePrecision",
    "date_display" TEXT,
    "date_deduced" BOOLEAN NOT NULL DEFAULT false,
    "date_clue" TEXT,
    "date_sort_key" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_people" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "box_x" DOUBLE PRECISION,
    "box_y" DOUBLE PRECISION,
    "box_w" DOUBLE PRECISION,
    "box_h" DOUBLE PRECISION,
    "face_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faces" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "box_x" DOUBLE PRECISION NOT NULL,
    "box_y" DOUBLE PRECISION NOT NULL,
    "box_w" DOUBLE PRECISION NOT NULL,
    "box_h" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION,
    "model" TEXT NOT NULL,
    "embedding" vector(128),
    "person_id" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "rejected_person_ids" UUID[],
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_photo_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_photos" (
    "album_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "album_photos_pkey" PRIMARY KEY ("album_id","photo_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "parent_id" UUID,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "photo_id" UUID,
    "comment_id" UUID,
    "user_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "original_url" TEXT,
    "mime_type" TEXT,
    "bytes" INTEGER,
    "text" TEXT,
    "search_vector" tsvector,
    "status" "PublishStatus" NOT NULL DEFAULT 'PUBLISHED',
    "place_id" UUID,
    "uploaded_by_id" UUID,
    "date_year" INTEGER,
    "date_month" INTEGER,
    "date_day" INTEGER,
    "date_precision" "DatePrecision",
    "date_display" TEXT,
    "date_deduced" BOOLEAN NOT NULL DEFAULT false,
    "date_clue" TEXT,
    "date_sort_key" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "heading" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_batches" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "source" "IngestSource" NOT NULL,
    "status" "IngestBatchStatus" NOT NULL DEFAULT 'OPEN',
    "created_by_user_id" UUID,
    "created_by_api_key_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "ingest_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_items" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "kind" "IngestItemKind" NOT NULL,
    "status" "IngestItemStatus" NOT NULL DEFAULT 'RECEIVED',
    "sha256" TEXT NOT NULL,
    "original_filename" TEXT,
    "sidecar" JSONB,
    "error" TEXT,
    "photo_id" UUID,
    "document_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "modality" "Modality" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "audio_url" TEXT,
    "tool_calls" JSONB,
    "citations" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "people_slug_key" ON "people"("slug");

-- CreateIndex
CREATE INDEX "relationships_to_person_id_idx" ON "relationships"("to_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_type_from_person_id_to_person_id_qualifier_key" ON "relationships"("type", "from_person_id", "to_person_id", "qualifier");

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_kind_idx" ON "events"("kind");

-- CreateIndex
CREATE INDEX "events_date_month_date_day_idx" ON "events"("date_month", "date_day");

-- CreateIndex
CREATE INDEX "events_date_sort_key_idx" ON "events"("date_sort_key");

-- CreateIndex
CREATE INDEX "events_place_id_idx" ON "events"("place_id");

-- CreateIndex
CREATE INDEX "event_participants_person_id_idx" ON "event_participants"("person_id");

-- CreateIndex
CREATE INDEX "sources_document_id_idx" ON "sources"("document_id");

-- CreateIndex
CREATE INDEX "sources_photo_id_idx" ON "sources"("photo_id");

-- CreateIndex
CREATE INDEX "claims_status_created_at_idx" ON "claims"("status", "created_at");

-- CreateIndex
CREATE INDEX "claims_applied_type_applied_id_idx" ON "claims"("applied_type", "applied_id");

-- CreateIndex
CREATE INDEX "changelog_entity_type_entity_id_created_at_idx" ON "changelog"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_person_id_key" ON "users"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "verification_codes_phone_created_at_idx" ON "verification_codes"("phone", "created_at");

-- CreateIndex
CREATE INDEX "auth_attempts_key_created_at_idx" ON "auth_attempts"("key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");

-- CreateIndex
CREATE INDEX "invites_phone_idx" ON "invites"("phone");

-- CreateIndex
CREATE INDEX "invites_person_id_idx" ON "invites"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "photos_sha256_key" ON "photos"("sha256");

-- CreateIndex
CREATE INDEX "photos_status_created_at_idx" ON "photos"("status", "created_at");

-- CreateIndex
CREATE INDEX "photos_date_month_date_day_idx" ON "photos"("date_month", "date_day");

-- CreateIndex
CREATE INDEX "photos_date_sort_key_idx" ON "photos"("date_sort_key");

-- CreateIndex
CREATE INDEX "photos_place_id_idx" ON "photos"("place_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_people_face_id_key" ON "photo_people"("face_id");

-- CreateIndex
CREATE INDEX "photo_people_person_id_idx" ON "photo_people"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_people_photo_id_person_id_key" ON "photo_people"("photo_id", "person_id");

-- CreateIndex
CREATE INDEX "faces_photo_id_idx" ON "faces"("photo_id");

-- CreateIndex
CREATE INDEX "faces_person_id_idx" ON "faces"("person_id");

-- CreateIndex
CREATE INDEX "album_photos_photo_id_idx" ON "album_photos"("photo_id");

-- CreateIndex
CREATE INDEX "comments_photo_id_created_at_idx" ON "comments"("photo_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_photo_id_user_id_emoji_key" ON "reactions"("photo_id", "user_id", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_comment_id_user_id_emoji_key" ON "reactions"("comment_id", "user_id", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "documents_sha256_key" ON "documents"("sha256");

-- CreateIndex
CREATE INDEX "documents_search_vector_idx" ON "documents" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "documents_status_created_at_idx" ON "documents"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_id_position_key" ON "document_chunks"("document_id", "position");

-- CreateIndex
CREATE INDEX "ingest_items_sha256_idx" ON "ingest_items"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_items_batch_id_sha256_key" ON "ingest_items"("batch_id", "sha256");

-- CreateIndex
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_avatar_photo_id_fkey" FOREIGN KEY ("avatar_photo_id") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_from_person_id_fkey" FOREIGN KEY ("from_person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_to_person_id_fkey" FOREIGN KEY ("to_person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_ingest_batch_id_fkey" FOREIGN KEY ("ingest_batch_id") REFERENCES "ingest_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changelog" ADD CONSTRAINT "changelog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changelog" ADD CONSTRAINT "changelog_actor_api_key_id_fkey" FOREIGN KEY ("actor_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_people" ADD CONSTRAINT "photo_people_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_people" ADD CONSTRAINT "photo_people_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_people" ADD CONSTRAINT "photo_people_face_id_fkey" FOREIGN KEY ("face_id") REFERENCES "faces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faces" ADD CONSTRAINT "faces_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faces" ADD CONSTRAINT "faces_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_photo_id_fkey" FOREIGN KEY ("cover_photo_id") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_batches" ADD CONSTRAINT "ingest_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_batches" ADD CONSTRAINT "ingest_batches_created_by_api_key_id_fkey" FOREIGN KEY ("created_by_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ingest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────── hand-written: not expressible in schema.prisma ───────────────
-- Listed in prisma/README.md. Later migrations must not drop these.

-- A reaction targets exactly one of a photo or a comment.
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_one_target_check"
  CHECK (("photo_id" IS NULL) <> ("comment_id" IS NULL));

-- A person is never their own parent or partner.
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_not_self_check"
  CHECK ("from_person_id" <> "to_person_id");

-- Fuzzy dates: month and day stay in range wherever they appear.
ALTER TABLE "events" ADD CONSTRAINT "events_date_range_check"
  CHECK (("date_month" IS NULL OR "date_month" BETWEEN 1 AND 12) AND ("date_day" IS NULL OR "date_day" BETWEEN 1 AND 31));
ALTER TABLE "photos" ADD CONSTRAINT "photos_date_range_check"
  CHECK (("date_month" IS NULL OR "date_month" BETWEEN 1 AND 12) AND ("date_day" IS NULL OR "date_day" BETWEEN 1 AND 31));
ALTER TABLE "documents" ADD CONSTRAINT "documents_date_range_check"
  CHECK (("date_month" IS NULL OR "date_month" BETWEEN 1 AND 12) AND ("date_day" IS NULL OR "date_day" BETWEEN 1 AND 31));

-- Keep documents.search_vector in step with title and text (title weighs more).
CREATE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.text, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, text ON "documents"
  FOR EACH ROW EXECUTE FUNCTION documents_search_vector_update();

-- Nearest-neighbour search over faces a person has confirmed. Partial, so the
-- index only holds faces that can be the answer to "who is this?".
CREATE INDEX "faces_embedding_labeled_hnsw_idx" ON "faces"
  USING hnsw ("embedding" vector_l2_ops)
  WHERE "person_id" IS NOT NULL AND "embedding" IS NOT NULL;
