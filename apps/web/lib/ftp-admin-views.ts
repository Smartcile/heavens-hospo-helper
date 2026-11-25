// Shared admin JSON shapes for FTP parking types, test members and the plate
// log. Kept in one place so the routes cannot drift.

import type { FtpClaim, FtpParkingType, Member, MemberPlate } from '@hospo-ops/db'
import { sortMemberPlates } from './ftp-parking'

export function ftpTypeAdminView(
  row: FtpParkingType,
  counts: { members: number; claims: number } = { members: 0, claims: 0 },
  guest: {
    used: number
    remaining: number | null
    full: boolean
    nextFreeAt: string | null
    entryUrl: string
  } = { used: 0, remaining: null, full: false, nextFreeAt: null, entryUrl: '' },
) {
  return {
    id: row.id,
    name: row.name,
    windowLabel: row.windowLabel,
    durationMinutes: row.durationMinutes,
    claimUrl: row.claimUrl,
    claimCode: row.claimCode,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    useContactEmail: row.useContactEmail,
    useContactPhone: row.useContactPhone,
    logPlates: row.logPlates,
    plateRemovalRequiresPin: row.plateRemovalRequiresPin,
    showOnKiosk: row.showOnKiosk,
    adminPinEnabled: row.adminPinEnabled,
    adminPinSet: Boolean(row.adminPinHash),
    adminPinHint: row.adminPinHint,
    guestEntryEnabled: row.guestEntryEnabled,
    guestEntryLabel: row.guestEntryLabel,
    guestEntryPinSet: Boolean(row.guestEntryPinHash),
    guestEntryPinHint: row.guestEntryPinHint,
    guestPlateLimitEnabled: row.guestPlateLimitEnabled,
    guestPlateLimit: row.guestPlateLimit,
    guestUsed: guest.used,
    guestRemaining: guest.remaining,
    guestFull: guest.full,
    guestNextFreeAt: guest.nextFreeAt,
    guestEntryUrl: guest.entryUrl,
    healthCheckMode: row.healthCheckMode,
    healthPlate: row.healthPlate,
    lastCheckAt: row.lastCheckAt,
    lastCheckOk: row.lastCheckOk,
    lastCheckMessage: row.lastCheckMessage,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    notes: row.notes,
    memberCount: counts.members,
    claimCount: counts.claims,
  }
}

export function ftpMemberAdminView(
  row: Member & {
    parkingType?: { id: string; name: string } | null
    plates?: MemberPlate[]
  },
) {
  return {
    id: row.id,
    membershipNumber: row.membershipNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    parkingTypeId: row.parkingTypeId,
    parkingTypeName: row.parkingType?.name ?? null,
    isActive: row.isActive,
    isTest: row.isTest,
    savePlates: row.savePlates,
    notes: row.notes,
    createdAt: row.createdAt,
    plates: sortMemberPlates(
      (row.plates ?? []).filter((plate) => plate.status === 'ACTIVE' && !plate.deletedAt),
    ).map((plate) => ({
      id: plate.id,
      plate: plate.plate,
      isDefault: plate.isDefault,
      createdAt: plate.createdAt,
    })),
  }
}

export function ftpClaimAdminView(row: FtpClaim) {
  return {
    id: row.id,
    typeId: row.typeId,
    typeName: row.typeName,
    memberId: row.memberId,
    membershipNumber: row.membershipNumber,
    credentialKind: row.credentialKind,
    licensePlate: row.licensePlate,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    claimCode: row.claimCode,
    status: row.status,
    message: row.message,
    httpStatus: row.httpStatus,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    locations: (row.locations as string[] | null) ?? [],
    confirmationText: row.confirmationText,
    evidencePdfPath: row.evidencePdfPath,
    evidenceImagePath: row.evidenceImagePath,
    evidenceHtmlPath: row.evidenceHtmlPath,
    durationMs: row.durationMs,
    note: row.note,
    createdAt: row.createdAt,
  }
}
