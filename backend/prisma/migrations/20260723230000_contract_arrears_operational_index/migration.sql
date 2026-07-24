-- Prioritize the operational arrears queue without indexing contracts that have no open balance.
CREATE INDEX "contracts_arrears_operational_idx"
ON "contracts" ("agreement_id", "party_id", "status", "arrears_amount" DESC)
WHERE "arrears_amount" > 0;
