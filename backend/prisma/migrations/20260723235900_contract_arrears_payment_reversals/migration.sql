-- CreateTable
CREATE TABLE "contract_arrears_payment_reversals" (
  "id" UUID NOT NULL,
  "agreement_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "arrears_before" DECIMAL(18,2) NOT NULL,
  "arrears_after" DECIMAL(18,2) NOT NULL,
  "reason_encrypted" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "reversed_by_user_id" UUID NOT NULL,
  "reversed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_arrears_payment_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_arrears_payment_reversals_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "contract_arrears_payment_reversals_balances_check" CHECK (
    "arrears_before" >= 0
    AND "arrears_after" = "arrears_before" + "amount"
  )
);

CREATE UNIQUE INDEX "contract_arrears_payment_reversals_payment_id_key"
ON "contract_arrears_payment_reversals"("payment_id");

CREATE UNIQUE INDEX "contract_arrears_payment_reversals_idempotency_key"
ON "contract_arrears_payment_reversals"("agreement_id", "idempotency_key");

CREATE INDEX "contract_arrears_payment_reversals_contract_idx"
ON "contract_arrears_payment_reversals"("agreement_id", "party_id", "contract_id", "reversed_at");

ALTER TABLE "contract_arrears_payment_reversals"
ADD CONSTRAINT "contract_arrears_payment_reversals_agreement_id_fkey"
FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "contract_arrears_payment_reversals_party_id_fkey"
FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "contract_arrears_payment_reversals_contract_id_fkey"
FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "contract_arrears_payment_reversals_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "contract_arrears_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "contract_arrears_payment_reversals_reversed_by_user_id_fkey"
FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
