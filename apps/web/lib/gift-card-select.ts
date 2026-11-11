// Fields the worker phone renders. Deliberately excludes admin-private notes
// and internal bookkeeping (isInternal, wooOrderId, replacesId, venueId).
export const GIFT_CARD_PHONE_SELECT = {
  id: true,
  number: true,
  amount: true,
  redeemedAmount: true,
  status: true,
  customerName: true,
  customerEmail: true,
  message: true,
  issuedAt: true,
  sentAt: true,
  expiresAt: true,
  redeemedAt: true,
  pdfPath: true,
  createdAt: true,
  history: true,
} as const
