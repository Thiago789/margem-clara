-- CreateEnum
CREATE TYPE "PayrollExceptionStatus" AS ENUM ('OPEN', 'IN_REVIEW');

-- AlterTable
ALTER TABLE "payroll_discount_events" ADD COLUMN     "acknowledged_at" TIMESTAMPTZ(6),
ADD COLUMN     "acknowledged_by_user_id" UUID,
ADD COLUMN     "exception_status" "PayrollExceptionStatus",
ADD COLUMN     "review_note_encrypted" TEXT,
ADD COLUMN     "review_version" INTEGER NOT NULL DEFAULT 1;

UPDATE "payroll_discount_events"
SET "exception_status" = 'OPEN'
WHERE "outcome" IN ('PARTIAL', 'REJECTED');

ALTER TABLE "payroll_discount_events"
ADD CONSTRAINT "payroll_discount_events_exception_status_check"
CHECK (
  ("outcome" = 'FULL' AND "exception_status" IS NULL)
  OR
  ("outcome" IN ('PARTIAL', 'REJECTED') AND "exception_status" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "payroll_discount_events_exception_queue_idx" ON "payroll_discount_events"("agreement_id", "payroll_cycle_id", "exception_status", "processed_at");

-- AddForeignKey
ALTER TABLE "payroll_discount_events" ADD CONSTRAINT "payroll_discount_events_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

