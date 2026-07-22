CREATE TYPE "MarginReservationStatus" AS ENUM (
  'PENDING_CONFIRMATION',
  'ACTIVE',
  'CANCELLED',
  'EXPIRED',
  'CONVERTED'
);

CREATE TYPE "ReservationConfirmationMode" AS ENUM ('CODE_REQUIRED', 'IMMEDIATE');

CREATE TABLE "margin_reservations" (
  "id" UUID NOT NULL,
  "agreement_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "accreditation_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "margin_account_id" UUID NOT NULL,
  "policy_version_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "status" "MarginReservationStatus" NOT NULL,
  "confirmation_mode" "ReservationConfirmationMode" NOT NULL,
  "confirmation_code_hash" TEXT,
  "confirmation_expires_at" TIMESTAMPTZ(6),
  "confirmation_attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(6),
  "confirmed_at" TIMESTAMPTZ(6),
  "confirmed_by_user_id" UUID,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by_user_id" UUID,
  "cancellation_reason" TEXT,
  "expired_at" TIMESTAMPTZ(6),
  "idempotency_key" TEXT NOT NULL,
  "external_reference" TEXT,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "lock_version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "margin_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "margin_reservations_idempotency_key"
  ON "margin_reservations"("agreement_id", "idempotency_key");
CREATE INDEX "margin_reservations_party_status_idx"
  ON "margin_reservations"("agreement_id", "party_id", "status", "created_at");
CREATE INDEX "margin_reservations_account_status_idx"
  ON "margin_reservations"("margin_account_id", "status", "expires_at");

ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_party_id_fkey"
  FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_accreditation_id_fkey"
  FOREIGN KEY ("accreditation_id") REFERENCES "accreditations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_margin_account_id_fkey"
  FOREIGN KEY ("margin_account_id") REFERENCES "margin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_policy_version_id_fkey"
  FOREIGN KEY ("policy_version_id") REFERENCES "agreement_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "margin_reservations" ADD CONSTRAINT "margin_reservations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
