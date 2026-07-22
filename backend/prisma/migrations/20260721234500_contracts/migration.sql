CREATE TYPE "ContractOperationType" AS ENUM ('NEW', 'REFINANCING', 'PORTABILITY', 'DEBT_PURCHASE');
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'SETTLED', 'CANCELLED');

ALTER TABLE "margin_reservations" ADD COLUMN "converted_at" TIMESTAMPTZ(6);

CREATE TABLE "contracts" (
  "id" UUID NOT NULL,
  "agreement_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "accreditation_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "margin_account_id" UUID NOT NULL,
  "policy_version_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "contract_number" TEXT NOT NULL,
  "operation_type" "ContractOperationType" NOT NULL,
  "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
  "contract_value" DECIMAL(18,2),
  "installment_amount" DECIMAL(18,2) NOT NULL,
  "term_installments" INTEGER,
  "current_installment" INTEGER NOT NULL DEFAULT 0,
  "cet_annual" DECIMAL(9,6),
  "cet_monthly" DECIMAL(9,6),
  "first_due_date" DATE,
  "first_competency" DATE,
  "outstanding_balance" DECIMAL(18,2),
  "origin_contract_reference" TEXT,
  "origin_creditor_name" TEXT,
  "debt_purchase_amount" DECIMAL(18,2),
  "external_reference" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "activated_at" TIMESTAMPTZ(6) NOT NULL,
  "suspended_at" TIMESTAMPTZ(6),
  "settled_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contracts_reservation_id_key" ON "contracts"("reservation_id");
CREATE INDEX "contracts_party_status_idx" ON "contracts"("agreement_id", "party_id", "status", "created_at");
CREATE INDEX "contracts_margin_account_status_idx" ON "contracts"("margin_account_id", "status");
CREATE INDEX "contracts_enrollment_status_idx" ON "contracts"("enrollment_id", "status");
CREATE UNIQUE INDEX "contracts_idempotency_key" ON "contracts"("agreement_id", "idempotency_key");
CREATE UNIQUE INDEX "contracts_party_number_key" ON "contracts"("agreement_id", "party_id", "contract_number");

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_accreditation_id_fkey" FOREIGN KEY ("accreditation_id") REFERENCES "accreditations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_margin_account_id_fkey" FOREIGN KEY ("margin_account_id") REFERENCES "margin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "agreement_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "margin_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
