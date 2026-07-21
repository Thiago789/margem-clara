CREATE TYPE "MarginMovementType" AS ENUM ('RECALCULATION', 'RESERVATION', 'RELEASE', 'CONSUMPTION', 'BLOCK', 'UNBLOCK', 'REVERSAL');
CREATE TYPE "MarginMovementDirection" AS ENUM ('INCREASE', 'DECREASE', 'NO_CHANGE');

CREATE TABLE "margin_groups" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "margin_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "margin_accounts" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "margin_group_id" UUID NOT NULL,
    "current_snapshot_id" UUID,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "consumed_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reserved_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "blocked_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "available_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "margin_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "margin_snapshots" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "payroll_cycle_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "margin_group_id" UUID NOT NULL,
    "margin_account_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "calculation_base" DECIMAL(18,2) NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "consumed_amount" DECIMAL(18,2) NOT NULL,
    "reserved_amount" DECIMAL(18,2) NOT NULL,
    "blocked_amount" DECIMAL(18,2) NOT NULL,
    "available_amount" DECIMAL(18,2) NOT NULL,
    "calculation_version" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "margin_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "margin_movements" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "margin_account_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "movement_type" "MarginMovementType" NOT NULL,
    "direction" "MarginMovementDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_before" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "margin_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "margin_groups_agreement_id_code_key" ON "margin_groups"("agreement_id", "code");
CREATE UNIQUE INDEX "margin_accounts_current_snapshot_id_key" ON "margin_accounts"("current_snapshot_id");
CREATE UNIQUE INDEX "margin_accounts_agreement_id_enrollment_id_margin_group_id_key" ON "margin_accounts"("agreement_id", "enrollment_id", "margin_group_id");
CREATE INDEX "margin_accounts_agreement_id_enrollment_id_status_idx" ON "margin_accounts"("agreement_id", "enrollment_id", "status");
CREATE UNIQUE INDEX "margin_snapshots_payroll_cycle_id_enrollment_id_margin_group_id_key" ON "margin_snapshots"("payroll_cycle_id", "enrollment_id", "margin_group_id");
CREATE INDEX "margin_snapshots_agreement_id_enrollment_id_created_at_idx" ON "margin_snapshots"("agreement_id", "enrollment_id", "created_at");
CREATE UNIQUE INDEX "margin_movements_agreement_id_idempotency_key_key" ON "margin_movements"("agreement_id", "idempotency_key");
CREATE INDEX "margin_movements_agreement_id_margin_account_id_created_at_idx" ON "margin_movements"("agreement_id", "margin_account_id", "created_at");

ALTER TABLE "margin_groups" ADD CONSTRAINT "margin_groups_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_accounts" ADD CONSTRAINT "margin_accounts_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_accounts" ADD CONSTRAINT "margin_accounts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_accounts" ADD CONSTRAINT "margin_accounts_margin_group_id_fkey" FOREIGN KEY ("margin_group_id") REFERENCES "margin_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_snapshots" ADD CONSTRAINT "margin_snapshots_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_snapshots" ADD CONSTRAINT "margin_snapshots_payroll_cycle_id_fkey" FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_snapshots" ADD CONSTRAINT "margin_snapshots_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_snapshots" ADD CONSTRAINT "margin_snapshots_margin_group_id_fkey" FOREIGN KEY ("margin_group_id") REFERENCES "margin_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_snapshots" ADD CONSTRAINT "margin_snapshots_margin_account_id_fkey" FOREIGN KEY ("margin_account_id") REFERENCES "margin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_snapshots" ADD CONSTRAINT "margin_snapshots_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "agreement_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_accounts" ADD CONSTRAINT "margin_accounts_current_snapshot_id_fkey" FOREIGN KEY ("current_snapshot_id") REFERENCES "margin_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "margin_movements" ADD CONSTRAINT "margin_movements_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_movements" ADD CONSTRAINT "margin_movements_margin_account_id_fkey" FOREIGN KEY ("margin_account_id") REFERENCES "margin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "margin_movements" ADD CONSTRAINT "margin_movements_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
