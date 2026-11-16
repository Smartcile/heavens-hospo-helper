export interface CustomerGroupRow {
  id: string
  venueId: string
  name: string
  slug: string
  kind: 'MEMBER_DATABASE' | 'GIFT_CARD'
  description: string | null
  colour: string | null
  isActive: boolean
  sortOrder: number
  areas: string[]
  mapping: {
    typeActive: number
    statusActive: number
    typeRemoved: number
    statusRemoved: number
    exportEncoding: string
  }
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface MembershipRow {
  id: string
  venueId: string
  groupId: string
  groupName: string
  groupKind: string
  customerId: string | null
  customerName: string | null
  membershipNumber: string
  firstName: string
  lastName: string
  displayName: string
  memberType: string | null
  isActive: boolean
  isFamily: boolean
  isPrimary: boolean
  familySurnames: string | null
  email: string | null
  phone: string | null
  memberInterests: string | null
  company: string | null
  externalId: string | null
  source: string
  giftCardId: string | null
  lastImportedAt: string | null
  createdAt: string
  updatedAt: string
}
