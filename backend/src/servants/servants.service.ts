import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Enrollment, Person } from "../generated/prisma/client.js";
import { DataProtectionService } from "../platform/crypto/data-protection.service.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import type { RequestContext } from "../platform/request-context/request-context.js";
import type { CreateServantDto, ServantLookupDto } from "./servant.dto.js";
import {
  isValidCpf,
  maskCpf,
  maskEnrollmentNumber,
  normalizeCpf,
  normalizeEnrollmentNumber,
  normalizePhone,
} from "./servant-identifiers.js";

type EnrollmentWithPerson = Enrollment & { person: Person };

function parseDateOnly(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} invalida`);
  }
  return date;
}

function optionalDate(value: string | undefined, field: string): Date | undefined {
  return value ? parseDateOnly(value.slice(0, 10), field) : undefined;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function moneyToCents(value: string): bigint {
  const [units, decimals = ""] = value.split(".");
  return BigInt(units!) * 100n + BigInt(decimals.padEnd(2, "0"));
}

@Injectable()
export class ServantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly protection: DataProtectionService,
  ) {}

  async create(agreementId: string, input: CreateServantDto, context: RequestContext) {
    const cpf = normalizeCpf(input.cpf);
    if (!isValidCpf(cpf)) throw new BadRequestException("CPF invalido");

    const enrollmentNumber = normalizeEnrollmentNumber(input.enrollmentNumber);
    const phone = input.phone ? normalizePhone(input.phone) : undefined;
    if (phone && (phone.length < 10 || phone.length > 13)) {
      throw new BadRequestException("Telefone invalido");
    }

    const birthDate = parseDateOnly(input.birthDate, "Data de nascimento");
    const admissionDate = optionalDate(input.admissionDate, "Data de admissao");
    const terminationDate = optionalDate(input.terminationDate, "Data de desligamento");
    if (admissionDate && terminationDate && terminationDate < admissionDate) {
      throw new BadRequestException("Data de desligamento anterior a admissao");
    }
    const baseSalary = moneyToCents(input.baseSalary);
    if (moneyToCents(input.mandatoryDeductions) > baseSalary) {
      throw new BadRequestException("Descontos obrigatorios superam a remuneracao base");
    }
    if (moneyToCents(input.marginBase) > baseSalary) {
      throw new BadRequestException("Base de margem supera a remuneracao base");
    }

    const cpfLookupHash = this.protection.lookupHash(cpf, "person.cpf");
    const enrollmentLookupKey = this.protection.lookupHash(
      enrollmentNumber,
      "enrollment.number",
    );

    try {
      const created = await this.prisma.$transaction(
        async (transaction) => {
          const agreement = await transaction.agreement.findUnique({
            where: { id: agreementId },
            select: { id: true, status: true },
          });
          if (!agreement) throw new NotFoundException("Convenio nao encontrado");
          if (agreement.status !== "ACTIVE") throw new ConflictException("Convenio nao esta ativo");

          const duplicate = await transaction.enrollment.findUnique({
            where: { agreementId_enrollmentLookupKey: { agreementId, enrollmentLookupKey } },
            select: { id: true },
          });
          if (duplicate) throw new ConflictException("Matricula ja cadastrada no convenio");

          let person = await transaction.person.findUnique({ where: { cpfLookupHash } });
          if (person) {
            const storedCpf = this.protection.decrypt(person.cpfEncrypted, "person.cpf");
            if (storedCpf !== cpf || person.birthDate.toISOString().slice(0, 10) !== input.birthDate) {
              throw new ConflictException("Dados de identidade divergentes");
            }
            if (person.status !== "ACTIVE") {
              throw new ConflictException("Cadastro da pessoa nao esta ativo");
            }
          } else {
            person = await transaction.person.create({
              data: {
                fullName: input.fullName.trim(),
                socialName: input.socialName?.trim() ?? null,
                cpfEncrypted: this.protection.encrypt(cpf, "person.cpf"),
                cpfLookupHash,
                birthDate,
                emailEncrypted: input.email
                  ? this.protection.encrypt(input.email.trim().toLowerCase(), "person.email")
                  : null,
                phoneEncrypted: phone
                  ? this.protection.encrypt(phone, "person.phone")
                  : null,
              },
            });
          }

          const enrollment: EnrollmentWithPerson = await transaction.enrollment.create({
            data: {
              agreementId,
              personId: person.id,
              enrollmentNumberEncrypted: this.protection.encrypt(
                enrollmentNumber,
                "enrollment.number",
              ),
              enrollmentLookupKey,
              functionalStatus: input.functionalStatus,
              employmentType: input.employmentType ?? null,
              admissionDate: admissionDate ?? null,
              terminationDate: terminationDate ?? null,
              payrollGroup: input.payrollGroup?.trim() ?? null,
              department: input.department?.trim() ?? null,
              costCenter: input.costCenter?.trim() ?? null,
              baseSalary: input.baseSalary,
              mandatoryDeductions: input.mandatoryDeductions,
              marginBase: input.marginBase,
              sourceUpdatedAt: input.sourceUpdatedAt ? new Date(input.sourceUpdatedAt) : null,
            },
            include: { person: true },
          });

          await transaction.auditEvent.create({
            data: {
              agreementId,
              actorUserId: context.actor?.userId ?? null,
              actorRole: context.actor?.role ?? null,
              action: "servant.create",
              outcome: "success",
              entityType: "enrollment",
              entityId: enrollment.id,
              correlationId: context.correlationId,
              newData: {
                functionalStatus: enrollment.functionalStatus,
                employmentType: enrollment.employmentType,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
          return enrollment;
        },
        { isolationLevel: "Serializable" },
      );
      return this.toView(created);
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException("Servidor ou matricula ja cadastrado");
      throw error;
    }
  }

  async list(agreementId: string, limit: number) {
    const rows = await this.prisma.enrollment.findMany({
      where: { agreementId },
      include: { person: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => this.toView(row));
  }

  async get(agreementId: string, enrollmentId: string) {
    const row = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, agreementId },
      include: { person: true },
    });
    if (!row) throw new NotFoundException("Servidor nao encontrado");
    return this.toView(row);
  }

  async lookup(agreementId: string, input: ServantLookupDto) {
    if (!input.cpf && !input.enrollmentNumber) {
      throw new BadRequestException("Informe CPF ou matricula");
    }

    const cpf = input.cpf ? normalizeCpf(input.cpf) : undefined;
    if (cpf && !isValidCpf(cpf)) throw new BadRequestException("CPF invalido");
    const enrollmentNumber = input.enrollmentNumber
      ? normalizeEnrollmentNumber(input.enrollmentNumber)
      : undefined;

    const row = await this.prisma.enrollment.findFirst({
      where: {
        agreementId,
        ...(enrollmentNumber
          ? {
              enrollmentLookupKey: this.protection.lookupHash(
                enrollmentNumber,
                "enrollment.number",
              ),
            }
          : {}),
        ...(cpf
          ? { person: { cpfLookupHash: this.protection.lookupHash(cpf, "person.cpf") } }
          : {}),
      },
      include: { person: true },
    });
    if (!row) throw new NotFoundException("Servidor nao encontrado");
    return this.toView(row);
  }

  private toView(row: EnrollmentWithPerson) {
    const cpf = this.protection.decrypt(row.person.cpfEncrypted, "person.cpf");
    const enrollmentNumber = this.protection.decrypt(
      row.enrollmentNumberEncrypted,
      "enrollment.number",
    );
    return {
      id: row.id,
      agreementId: row.agreementId,
      person: {
        id: row.person.id,
        fullName: row.person.fullName,
        socialName: row.person.socialName,
        cpfMasked: maskCpf(cpf),
        birthDate: row.person.birthDate.toISOString().slice(0, 10),
        status: row.person.status,
        emailRegistered: row.person.emailEncrypted !== null,
        phoneRegistered: row.person.phoneEncrypted !== null,
      },
      enrollmentNumberMasked: maskEnrollmentNumber(enrollmentNumber),
      functionalStatus: row.functionalStatus,
      employmentType: row.employmentType,
      admissionDate: row.admissionDate?.toISOString().slice(0, 10) ?? null,
      terminationDate: row.terminationDate?.toISOString().slice(0, 10) ?? null,
      payrollGroup: row.payrollGroup,
      department: row.department,
      costCenter: row.costCenter,
      baseSalary: row.baseSalary.toString(),
      mandatoryDeductions: row.mandatoryDeductions.toString(),
      marginBase: row.marginBase.toString(),
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
