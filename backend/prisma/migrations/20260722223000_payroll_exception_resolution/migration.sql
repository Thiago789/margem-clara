-- ExtendEnum
ALTER TYPE "PayrollExceptionStatus" ADD VALUE 'RESOLVED';

-- CreateEnum
CREATE TYPE "PayrollExceptionResolutionAction" AS ENUM ('RETRY_NEXT_CYCLE');

-- AlterTable
ALTER TABLE "payroll_discount_events"
ADD COLUMN "resolution_action" "PayrollExceptionResolutionAction",
ADD COLUMN "resolved_by_user_id" UUID,
ADD COLUMN "resolved_at" TIMESTAMPTZ(6),
ADD COLUMN "resolution_note_encrypted" TEXT;

ALTER TABLE "payroll_discount_events"
ADD CONSTRAINT "payroll_discount_events_resolution_check"
CHECK (
  (
    "exception_status" = 'RESOLVED'
    AND "resolution_action" IS NOT NULL
    AND "resolved_by_user_id" IS NOT NULL
    AND "resolved_at" IS NOT NULL
    AND "resolution_note_encrypted" IS NOT NULL
  )
  OR
  (
    "exception_status" IS DISTINCT FROM 'RESOLVED'
    AND "resolution_action" IS NULL
    AND "resolved_by_user_id" IS NULL
    AND "resolved_at" IS NULL
    AND "resolution_note_encrypted" IS NULL
  )
);

-- AddForeignKey
ALTER TABLE "payroll_discount_events"
ADD CONSTRAINT "payroll_discount_events_resolved_by_user_id_fkey"
FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
