-- ExtendEnum
ALTER TYPE "ContractStatus" ADD VALUE 'PAYROLL_COMPLETED_WITH_ARREARS';

-- CreateEnum
CREATE TYPE "ArrearsPaymentMethod" AS ENUM ('PIX', 'BOLETO', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- AlterTable
ALTER TABLE "contracts"
ADD COLUMN "fully_paid_installments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "total_discounted_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "arrears_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "payroll_completed_at" TIMESTAMPTZ(6),
ADD COLUMN "margin_released_at" TIMESTAMPTZ(6);

UPDATE "contracts" AS c
SET
  "fully_paid_installments" = c."current_installment",
  "total_discounted_amount" = COALESCE(events."total_discounted", 0),
  "arrears_amount" = COALESCE(events."partial_arrears", 0),
  "payroll_completed_at" = CASE WHEN c."status" = 'SETTLED' THEN c."settled_at" ELSE NULL END,
  "margin_released_at" = CASE WHEN c."status" = 'SETTLED' THEN c."settled_at" ELSE NULL END
FROM (
  SELECT
    "contract_id",
    SUM("discounted_amount") AS "total_discounted",
    SUM(CASE WHEN "outcome" = 'PARTIAL' THEN "expected_amount" - "discounted_amount" ELSE 0 END) AS "partial_arrears"
  FROM "payroll_discount_events"
  GROUP BY "contract_id"
) AS events
WHERE events."contract_id" = c."id";

ALTER TABLE "contracts"
ADD CONSTRAINT "contracts_arrears_nonnegative_check" CHECK ("arrears_amount" >= 0),
ADD CONSTRAINT "contracts_discounted_nonnegative_check" CHECK ("total_discounted_amount" >= 0),
ADD CONSTRAINT "contracts_installment_counters_check" CHECK (
  "current_installment" >= 0
  AND "fully_paid_installments" >= 0
  AND "fully_paid_installments" <= "current_installment"
);

-- CreateTable
CREATE TABLE "contract_arrears_payments" (
  "id" UUID NOT NULL,
  "agreement_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "arrears_before" DECIMAL(18,2) NOT NULL,
  "arrears_after" DECIMAL(18,2) NOT NULL,
  "method" "ArrearsPaymentMethod" NOT NULL,
  "paid_at" TIMESTAMPTZ(6) NOT NULL,
  "external_reference" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "recorded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_arrears_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_arrears_payments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "contract_arrears_payments_balances_check" CHECK (
    "arrears_before" >= "amount"
    AND "arrears_after" = "arrears_before" - "amount"
  )
);

CREATE UNIQUE INDEX "contract_arrears_payments_idempotency_key"
ON "contract_arrears_payments"("agreement_id", "idempotency_key");

CREATE INDEX "contract_arrears_payments_contract_idx"
ON "contract_arrears_payments"("agreement_id", "party_id", "contract_id", "paid_at");

ALTER TABLE "contract_arrears_payments"
ADD CONSTRAINT "contract_arrears_payments_agreement_id_fkey"
FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "contract_arrears_payments_party_id_fkey"
FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "contract_arrears_payments_contract_id_fkey"
FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "contract_arrears_payments_recorded_by_user_id_fkey"
FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
