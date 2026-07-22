-- CreateEnum
CREATE TYPE "PayrollInstructionStatus" AS ENUM ('GENERATED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "PayrollDiscountOutcome" AS ENUM ('FULL', 'PARTIAL', 'REJECTED');

-- CreateTable
CREATE TABLE "payroll_instructions" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "payroll_cycle_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "source_file_row_id" UUID NOT NULL,
    "installment_number" INTEGER,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "PayrollInstructionStatus" NOT NULL DEFAULT 'GENERATED',
    "reconciled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_discount_events" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "payroll_cycle_id" UUID NOT NULL,
    "instruction_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "source_file_row_id" UUID NOT NULL,
    "expected_amount" DECIMAL(18,2) NOT NULL,
    "discounted_amount" DECIMAL(18,2) NOT NULL,
    "outcome" "PayrollDiscountOutcome" NOT NULL,
    "installment_number" INTEGER,
    "reason" TEXT,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_discount_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_instructions_source_file_row_id_key" ON "payroll_instructions"("source_file_row_id");

-- CreateIndex
CREATE INDEX "payroll_instructions_agreement_id_status_created_at_idx" ON "payroll_instructions"("agreement_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_instructions_cycle_contract_key" ON "payroll_instructions"("payroll_cycle_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_discount_events_instruction_id_key" ON "payroll_discount_events"("instruction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_discount_events_source_file_row_id_key" ON "payroll_discount_events"("source_file_row_id");

-- CreateIndex
CREATE INDEX "payroll_discount_events_agreement_id_contract_id_processed__idx" ON "payroll_discount_events"("agreement_id", "contract_id", "processed_at");

-- AddForeignKey
ALTER TABLE "payroll_instructions" ADD CONSTRAINT "payroll_instructions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_instructions" ADD CONSTRAINT "payroll_instructions_payroll_cycle_id_fkey" FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_instructions" ADD CONSTRAINT "payroll_instructions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_instructions" ADD CONSTRAINT "payroll_instructions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_instructions" ADD CONSTRAINT "payroll_instructions_source_file_row_id_fkey" FOREIGN KEY ("source_file_row_id") REFERENCES "payroll_file_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_discount_events" ADD CONSTRAINT "payroll_discount_events_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_discount_events" ADD CONSTRAINT "payroll_discount_events_payroll_cycle_id_fkey" FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_discount_events" ADD CONSTRAINT "payroll_discount_events_instruction_id_fkey" FOREIGN KEY ("instruction_id") REFERENCES "payroll_instructions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_discount_events" ADD CONSTRAINT "payroll_discount_events_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_discount_events" ADD CONSTRAINT "payroll_discount_events_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_discount_events" ADD CONSTRAINT "payroll_discount_events_source_file_row_id_fkey" FOREIGN KEY ("source_file_row_id") REFERENCES "payroll_file_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

