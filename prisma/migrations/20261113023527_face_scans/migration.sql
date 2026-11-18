-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "faces_model" TEXT,
ADD COLUMN     "faces_scanned_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "photos_faces_model_idx" ON "photos"("faces_model");
