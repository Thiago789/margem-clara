ALTER INDEX "payroll_files_agreement_id_payroll_cycle_id_file_type_content_h"
  RENAME TO "payroll_files_cycle_type_hash_key";

ALTER INDEX "enrollment_payroll_snapshots_agreement_id_enrollment_id_created"
  RENAME TO "enrollment_payroll_snapshots_lookup_idx";

ALTER INDEX "margin_snapshots_payroll_cycle_id_enrollment_id_margin_group_id"
  RENAME TO "margin_snapshots_cycle_enrollment_group_key";
