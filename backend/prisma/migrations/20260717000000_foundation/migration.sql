-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('FINANCIAL_INSTITUTION', 'HEALTH_PLAN', 'INSURER', 'PENSION_PROVIDER', 'ASSOCIATION', 'UNION', 'COOPERATIVE', 'COMMERCE', 'SERVICE_PROVIDER', 'LAW_OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductFamily" AS ENUM ('PAYROLL_LOAN', 'PAYROLL_CARD', 'BENEFIT_CARD', 'OPTIONAL_DEDUCTION');

-- CreateEnum
CREATE TYPE "ChargeMode" AS ENUM ('FIXED_INSTALLMENTS', 'INDEFINITE_RECURRING', 'PERCENTAGE', 'VARIABLE_BY_COMPETENCY', 'OCCASIONAL', 'SINGLE_CHARGE', 'RESERVED_LIMIT');

-- CreateEnum
CREATE TYPE "AccreditationStatus" AS ENUM ('PENDING', 'HOMOLOGATION', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EnvironmentKind" AS ENUM ('HOMOLOGATION', 'PRODUCTION');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tenant_key" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
    "payroll_frequency" TEXT NOT NULL DEFAULT 'monthly',
    "data_classification" TEXT NOT NULL DEFAULT 'confidential',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_policy_versions" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "policy_type" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "document_number" TEXT NOT NULL,
    "party_type" "PartyType" NOT NULL,
    "regulatory_identifier" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" "ProductFamily" NOT NULL,
    "charge_mode" "ChargeMode" NOT NULL,
    "requires_credit_contract" BOOLEAN NOT NULL DEFAULT false,
    "requires_consent" BOOLEAN NOT NULL DEFAULT true,
    "supports_variable_amount" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accreditations" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "AccreditationStatus" NOT NULL DEFAULT 'PENDING',
    "environment" "EnvironmentKind" NOT NULL DEFAULT 'HOMOLOGATION',
    "integration_mode" TEXT NOT NULL DEFAULT 'manual',
    "operational_limit" DECIMAL(18,2),
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "approved_by_user_id" UUID,
    "suspension_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "accreditations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "social_name" TEXT,
    "cpf_encrypted" TEXT NOT NULL,
    "cpf_lookup_hash" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "email_encrypted" TEXT,
    "phone_encrypted" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "enrollment_number" TEXT NOT NULL,
    "enrollment_lookup_key" TEXT NOT NULL,
    "functional_status" TEXT NOT NULL,
    "employment_type" TEXT,
    "admission_date" DATE,
    "termination_date" DATE,
    "payroll_group" TEXT,
    "department" TEXT,
    "cost_center" TEXT,
    "base_salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "mandatory_deductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "margin_base" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "source_updated_at" TIMESTAMPTZ(6),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "agreement_id" UUID,
    "party_id" UUID,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "agreement_id" UUID,
    "actor_user_id" UUID,
    "actor_role" TEXT,
    "actor_party_id" UUID,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "correlation_id" UUID NOT NULL,
    "request_id" TEXT,
    "previous_data" JSONB,
    "new_data" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_document_number_key" ON "organizations"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_tenant_key_key" ON "agreements"("tenant_key");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_organization_id_code_key" ON "agreements"("organization_id", "code");

-- CreateIndex
CREATE INDEX "agreement_policy_versions_agreement_id_policy_type_status_idx" ON "agreement_policy_versions"("agreement_id", "policy_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_policy_versions_agreement_id_policy_type_version__key" ON "agreement_policy_versions"("agreement_id", "policy_type", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "parties_document_number_key" ON "parties"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "accreditations_agreement_id_party_id_status_idx" ON "accreditations"("agreement_id", "party_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accreditations_agreement_id_party_id_product_id_environment_key" ON "accreditations"("agreement_id", "party_id", "product_id", "environment", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "people_cpf_lookup_hash_key" ON "people"("cpf_lookup_hash");

-- CreateIndex
CREATE INDEX "enrollments_agreement_id_person_id_status_idx" ON "enrollments"("agreement_id", "person_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_agreement_id_enrollment_lookup_key_key" ON "enrollments"("agreement_id", "enrollment_lookup_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "memberships_agreement_id_user_id_status_idx" ON "memberships"("agreement_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "memberships_party_id_user_id_status_idx" ON "memberships"("party_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "audit_events_agreement_id_occurred_at_idx" ON "audit_events"("agreement_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events"("correlation_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_occurred_at_idx" ON "outbox_events"("status", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_agreement_id_aggregate_type_aggregate_id_idx" ON "outbox_events"("agreement_id", "aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_policy_versions" ADD CONSTRAINT "agreement_policy_versions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditations" ADD CONSTRAINT "accreditations_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditations" ADD CONSTRAINT "accreditations_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditations" ADD CONSTRAINT "accreditations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
