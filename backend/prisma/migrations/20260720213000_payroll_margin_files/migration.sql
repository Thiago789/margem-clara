CREATE TYPE "PayrollCycleStatus" AS ENUM ('OPEN', 'REVIEW', 'PUBLISHED', 'CLOSED');
CREATE TYPE "PayrollFileType" AS ENUM ('MARGIN', 'INSERTION', 'RETURN');
CREATE TYPE "PayrollFileDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "PayrollFileStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'REJECTED', 'PROCESSING', 'APPLIED');
CREATE TYPE "PayrollFileRowStatus" AS ENUM ('VALID', 'INVALID', 'APPLIED');

CREATE TABLE "payroll_cycles" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "competency" DATE NOT NULL,
    "cutoff_at" TIMESTAMPTZ(6) NOT NULL,
    "insertion_due_at" TIMESTAMPTZ(6),
    "return_due_at" TIMESTAMPTZ(6),
    "status" "PayrollCycleStatus" NOT NULL DEFAULT 'OPEN',
    "policy_version_id" UUID,
    "closed_by_user_id" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "payroll_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_files" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "payroll_cycle_id" UUID NOT NULL,
    "file_type" "PayrollFileType" NOT NULL,
    "direction" "PayrollFileDirection" NOT NULL,
    "environment" "EnvironmentKind" NOT NULL,
    "layout_version" TEXT NOT NULL,
    "protocol_number" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "media_type" TEXT NOT NULL,
    "status" "PayrollFileStatus" NOT NULL DEFAULT 'RECEIVED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "processed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    CONSTRAINT "payroll_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_file_rows" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "payroll_file_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "enrollment_id" UUID,
    "external_reference_hash" TEXT,
    "amount" DECIMAL(18,2),
    "status" "PayrollFileRowStatus" NOT NULL,
    "raw_data_encrypted" TEXT NOT NULL,
    "normalized_data" JSONB,
    "errors" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_file_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollment_payroll_snapshots" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "payroll_cycle_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "source_file_row_id" UUID NOT NULL,
    "before_data" JSONB NOT NULL,
    "after_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enrollment_payroll_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_cycles_agreement_id_competency_key" ON "payroll_cycles"("agreement_id", "competency");
CREATE INDEX "payroll_cycles_agreement_id_status_idx" ON "payroll_cycles"("agreement_id", "status");
CREATE UNIQUE INDEX "payroll_files_agreement_id_protocol_number_key" ON "payroll_files"("agreement_id", "protocol_number");
CREATE UNIQUE INDEX "payroll_files_agreement_id_idempotency_key_key" ON "payroll_files"("agreement_id", "idempotency_key");
CREATE UNIQUE INDEX "payroll_files_agreement_id_payroll_cycle_id_file_type_content_hash_key" ON "payroll_files"("agreement_id", "payroll_cycle_id", "file_type", "content_hash");
CREATE INDEX "payroll_files_agreement_id_payroll_cycle_id_status_idx" ON "payroll_files"("agreement_id", "payroll_cycle_id", "status");
CREATE UNIQUE INDEX "payroll_file_rows_payroll_file_id_row_number_key" ON "payroll_file_rows"("payroll_file_id", "row_number");
CREATE INDEX "payroll_file_rows_agreement_id_enrollment_id_status_idx" ON "payroll_file_rows"("agreement_id", "enrollment_id", "status");
CREATE UNIQUE INDEX "enrollment_payroll_snapshots_source_file_row_id_key" ON "enrollment_payroll_snapshots"("source_file_row_id");
CREATE UNIQUE INDEX "enrollment_payroll_snapshots_payroll_cycle_id_enrollment_id_key" ON "enrollment_payroll_snapshots"("payroll_cycle_id", "enrollment_id");
CREATE INDEX "enrollment_payroll_snapshots_agreement_id_enrollment_id_created_at_idx" ON "enrollment_payroll_snapshots"("agreement_id", "enrollment_id", "created_at");

ALTER TABLE "payroll_cycles" ADD CONSTRAINT "payroll_cycles_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_cycles" ADD CONSTRAINT "payroll_cycles_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "agreement_policy_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_files" ADD CONSTRAINT "payroll_files_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_files" ADD CONSTRAINT "payroll_files_payroll_cycle_id_fkey" FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_file_rows" ADD CONSTRAINT "payroll_file_rows_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_file_rows" ADD CONSTRAINT "payroll_file_rows_payroll_file_id_fkey" FOREIGN KEY ("payroll_file_id") REFERENCES "payroll_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_file_rows" ADD CONSTRAINT "payroll_file_rows_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "enrollment_payroll_snapshots" ADD CONSTRAINT "enrollment_payroll_snapshots_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollment_payroll_snapshots" ADD CONSTRAINT "enrollment_payroll_snapshots_payroll_cycle_id_fkey" FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollment_payroll_snapshots" ADD CONSTRAINT "enrollment_payroll_snapshots_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollment_payroll_snapshots" ADD CONSTRAINT "enrollment_payroll_snapshots_source_file_row_id_fkey" FOREIGN KEY ("source_file_row_id") REFERENCES "payroll_file_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
