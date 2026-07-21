import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { operationalRulesSchema } from "../agreements/agreement-policy.schema.js";
import { normalizedMarginRowSchema } from "../payroll/margin-file.parser.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import { calculateMargin } from "./margin-calculator.js";

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

const publishedPayrollDataSchema = normalizedMarginRowSchema.omit({ enrollmentNumber: true });

@Injectable()
export class MarginsService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(agreementId: string, cycleId: string, context: RequestContext) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const cycle = await transaction.payrollCycle.findFirst({
            where: { id: cycleId, agreementId },
            include: { policyVersion: true },
          });
          if (!cycle) throw new NotFoundException("Ciclo de folha nao encontrado");
          if (cycle.status !== "PUBLISHED") {
            throw new ConflictException("Ciclo precisa ter margem publicada antes do calculo");
          }
          if (!cycle.policyVersion) throw new ConflictException("Ciclo sem politica vinculada");
          const policy = operationalRulesSchema.safeParse(cycle.policyVersion.payload);
          if (!policy.success || !policy.data.marginGroups?.length) {
            throw new ConflictException("Politica do ciclo nao possui grupos de margem validos");
          }
          const configuredCodes = new Set(policy.data.marginGroups.map((group) => group.code));
          const existingGroups = await transaction.marginGroup.findMany({
            where: { agreementId, status: "ACTIVE" },
            select: { code: true },
          });
          if (existingGroups.some((group) => !configuredCodes.has(group.code))) {
            throw new ConflictException("Remocao de grupo de margem exige migracao formal");
          }

          const existingCount = await transaction.marginSnapshot.count({
            where: { agreementId, payrollCycleId: cycleId },
          });
          if (existingCount > 0) {
            return {
              payrollCycleId: cycleId,
              status: "CALCULATED",
              snapshotCount: existingCount,
              duplicate: true,
            };
          }

          const payrollSnapshots = await transaction.enrollmentPayrollSnapshot.findMany({
            where: { agreementId, payrollCycleId: cycleId },
            orderBy: { createdAt: "asc" },
          });
          if (!payrollSnapshots.length) {
            throw new ConflictException("Ciclo nao possui registros de folha publicados");
          }

          let snapshotCount = 0;
          const publishedAt = new Date();
          for (const groupRule of policy.data.marginGroups) {
            const marginGroup = await transaction.marginGroup.upsert({
              where: { agreementId_code: { agreementId, code: groupRule.code } },
              create: {
                agreementId,
                code: groupRule.code,
                name: groupRule.name,
              },
              update: { name: groupRule.name, status: "ACTIVE" },
            });

            for (const payrollSnapshot of payrollSnapshots) {
              const payrollData = publishedPayrollDataSchema.safeParse(payrollSnapshot.afterData);
              if (!payrollData.success) {
                throw new ConflictException("Snapshot de folha inconsistente para calculo");
              }
              let account = await transaction.marginAccount.findUnique({
                where: {
                  agreementId_enrollmentId_marginGroupId: {
                    agreementId,
                    enrollmentId: payrollSnapshot.enrollmentId,
                    marginGroupId: marginGroup.id,
                  },
                },
                include: { currentSnapshot: { include: { payrollCycle: true } } },
              });
              if (account?.currentSnapshot?.payrollCycle.competency &&
                account.currentSnapshot.payrollCycle.competency > cycle.competency) {
                throw new ConflictException("Ciclo antigo nao pode substituir margem mais recente");
              }
              account ??= await transaction.marginAccount.create({
                data: {
                  agreementId,
                  enrollmentId: payrollSnapshot.enrollmentId,
                  marginGroupId: marginGroup.id,
                },
                include: { currentSnapshot: { include: { payrollCycle: true } } },
              });

              const eligible = policy.data.eligibleFunctionalStatuses.includes(
                payrollData.data.functionalStatus,
              );
              const calculation = calculateMargin({
                calculationBase: payrollData.data.marginBase,
                percentage: groupRule.percentage,
                consumedAmount: account.consumedAmount.toString(),
                reservedAmount: account.reservedAmount.toString(),
                blockedAmount: account.blockedAmount.toString(),
                previousAvailableAmount: account.availableAmount.toString(),
                eligible,
              });
              const calculationVersion = account.lockVersion + 1;
              const snapshot = await transaction.marginSnapshot.create({
                data: {
                  agreementId,
                  payrollCycleId: cycleId,
                  enrollmentId: payrollSnapshot.enrollmentId,
                  marginGroupId: marginGroup.id,
                  marginAccountId: account.id,
                  policyVersionId: cycle.policyVersion.id,
                  calculationBase: calculation.calculationBase,
                  percentage: calculation.percentage,
                  totalAmount: calculation.totalAmount,
                  consumedAmount: calculation.consumedAmount,
                  reservedAmount: calculation.reservedAmount,
                  blockedAmount: calculation.blockedAmount,
                  availableAmount: calculation.availableAmount,
                  calculationVersion,
                  explanation: {
                    formula: "available = max(base * percentage - consumed - reserved - blocked, 0)",
                    eligible,
                    functionalStatus: payrollData.data.functionalStatus,
                    deficitAmount: calculation.deficitAmount,
                    productFamilies: groupRule.productFamilies,
                    sharingMode: groupRule.sharingMode,
                    payrollRubricCode: groupRule.payrollRubricCode ?? null,
                    payrollSnapshotId: payrollSnapshot.id,
                    policyVersionId: cycle.policyVersion.id,
                  },
                  publishedAt,
                },
              });
              await transaction.marginMovement.create({
                data: {
                  agreementId,
                  marginAccountId: account.id,
                  enrollmentId: payrollSnapshot.enrollmentId,
                  movementType: "RECALCULATION",
                  direction: calculation.movement.direction,
                  amount: calculation.movement.amount,
                  balanceBefore: calculation.movement.balanceBefore,
                  balanceAfter: calculation.movement.balanceAfter,
                  sourceType: "MARGIN_SNAPSHOT",
                  sourceId: snapshot.id,
                  idempotencyKey: `margin-calc:${snapshot.id}`,
                  correlationId: context.correlationId,
                  actorUserId: context.actor?.userId ?? null,
                  reason: `Calculo da competencia ${cycle.competency.toISOString().slice(0, 7)}`,
                },
              });
              await transaction.marginAccount.update({
                where: { id: account.id },
                data: {
                  currentSnapshotId: snapshot.id,
                  totalAmount: calculation.totalAmount,
                  consumedAmount: calculation.consumedAmount,
                  reservedAmount: calculation.reservedAmount,
                  blockedAmount: calculation.blockedAmount,
                  availableAmount: calculation.availableAmount,
                  lockVersion: calculationVersion,
                },
              });
              snapshotCount += 1;
            }
          }

          await transaction.auditEvent.create({
            data: {
              agreementId,
              actorUserId: context.actor?.userId ?? null,
              actorRole: context.actor?.role ?? null,
              action: "margin.calculate",
              outcome: "success",
              entityType: "payroll_cycle",
              entityId: cycleId,
              correlationId: context.correlationId,
              newData: {
                competency: cycle.competency.toISOString().slice(0, 7),
                snapshotCount,
                marginGroupCount: policy.data.marginGroups.length,
                policyVersionId: cycle.policyVersion.id,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
          return {
            payrollCycleId: cycleId,
            status: "CALCULATED",
            snapshotCount,
            duplicate: false,
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (isUniqueConflict(error)) {
        const count = await this.prisma.marginSnapshot.count({
          where: { agreementId, payrollCycleId: cycleId },
        });
        if (count > 0) {
          return { payrollCycleId: cycleId, status: "CALCULATED", snapshotCount: count, duplicate: true };
        }
      }
      throw error;
    }
  }

  async getEnrollmentMargins(agreementId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, agreementId },
      select: { id: true },
    });
    if (!enrollment) throw new NotFoundException("Matricula nao encontrada");
    const accounts = await this.prisma.marginAccount.findMany({
      where: { agreementId, enrollmentId, status: "ACTIVE" },
      include: {
        marginGroup: true,
        currentSnapshot: true,
        movements: { orderBy: { createdAt: "desc" }, take: 20 },
      },
      orderBy: { marginGroup: { code: "asc" } },
    });
    return accounts.map((account) => ({
      id: account.id,
      marginGroup: { id: account.marginGroup.id, code: account.marginGroup.code, name: account.marginGroup.name },
      totalAmount: account.totalAmount.toString(),
      consumedAmount: account.consumedAmount.toString(),
      reservedAmount: account.reservedAmount.toString(),
      blockedAmount: account.blockedAmount.toString(),
      availableAmount: account.availableAmount.toString(),
      status: account.status,
      lockVersion: account.lockVersion,
      currentSnapshot: account.currentSnapshot
        ? {
            id: account.currentSnapshot.id,
            payrollCycleId: account.currentSnapshot.payrollCycleId,
            percentage: account.currentSnapshot.percentage.toString(),
            calculationBase: account.currentSnapshot.calculationBase.toString(),
            explanation: account.currentSnapshot.explanation,
            publishedAt: account.currentSnapshot.publishedAt.toISOString(),
          }
        : null,
      movements: account.movements.map((movement) => ({
        id: movement.id,
        movementType: movement.movementType,
        direction: movement.direction,
        amount: movement.amount.toString(),
        balanceBefore: movement.balanceBefore.toString(),
        balanceAfter: movement.balanceAfter.toString(),
        reason: movement.reason,
        createdAt: movement.createdAt.toISOString(),
      })),
    }));
  }
}
