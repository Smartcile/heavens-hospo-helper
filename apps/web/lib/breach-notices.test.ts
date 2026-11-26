import { describe, expect, it } from 'vitest'
import {
  breachDuplicateKey,
  describeBreachNotice,
  describeBreachStatus,
  firstPhotoUrl,
  isBreachPhoto,
  isClosedStatus,
  reviewActionToStatus,
  reviewReasonError,
  reviewTransitionError,
  validateBreachNotice,
  validateReviewAction,
} from './breach-notices'

const base = {
  subjectType: 'STAFF',
  kind: 'PARKING',
  numberplate: 'ab 123',
  noticeDetails: 'Parking infringement 998877 issued at the marina.',
  breachDate: '2026-11-01',
  attachmentUrls: ['/api/upload/photo-1.jpg'],
}

describe('validateBreachNotice', () => {
  it('normalises the plate and optional fields', () => {
    const result = validateBreachNotice({
      ...base,
      numberplate: ' ab-123 ',
      location: '  MARINA CARPARK ',
      fineAmount: '95.50',
      paymentDueDate: '2026-12-01',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.numberplate).toBe('AB123')
    expect(result.value.location).toBe('MARINA CARPARK')
    expect(result.value.fineAmount).toBe(95.5)
    expect(result.value.paymentDueDate).toBe('2026-12-01')
  })

  it('requires a valid plate, notice details and breach date', () => {
    expect(validateBreachNotice({ ...base, numberplate: '' })).toMatchObject({ ok: false })
    expect(validateBreachNotice({ ...base, numberplate: 'TOOLONGPLATE' })).toMatchObject({ ok: false })
    expect(validateBreachNotice({ ...base, noticeDetails: '   ' })).toMatchObject({ ok: false })
    expect(validateBreachNotice({ ...base, breachDate: 'not-a-date' })).toMatchObject({ ok: false })
  })

  it('rejects a breach date in the future', () => {
    expect(validateBreachNotice({ ...base, breachDate: '2026-11-02' }, { today: '2026-11-01' })).toMatchObject({
      ok: false,
      error: 'THE BREACH DATE CANNOT BE IN THE FUTURE',
    })
    expect(validateBreachNotice({ ...base, breachDate: '2026-11-01' }, { today: '2026-11-01' }).ok).toBe(true)
  })

  it('rejects a negative or non-numeric fine amount', () => {
    expect(validateBreachNotice({ ...base, fineAmount: -1 })).toMatchObject({ ok: false })
    expect(validateBreachNotice({ ...base, fineAmount: 'ninety' })).toMatchObject({ ok: false })
  })

  it('requires at least one photo and allows up to three attachments', () => {
    expect(validateBreachNotice({ ...base, attachmentUrls: [] })).toMatchObject({
      ok: false,
      error: 'ADD AT LEAST ONE PHOTO OF THE NOTICE',
    })
    expect(validateBreachNotice({ ...base, attachmentUrls: ['/api/upload/ticket.pdf'] })).toMatchObject({
      ok: false,
      error: 'AT LEAST ONE ATTACHMENT MUST BE A PHOTO',
    })
    const four = ['/api/upload/a.jpg', '/api/upload/b.jpg', '/api/upload/c.pdf', '/api/upload/d.jpg']
    expect(validateBreachNotice({ ...base, attachmentUrls: four })).toMatchObject({ ok: false })
    expect(
      validateBreachNotice({ ...base, attachmentUrls: ['/api/upload/a.jpg', '/api/upload/ticket.pdf'] }).ok,
    ).toBe(true)
  })

  it('keeps client details only on a client notice', () => {
    const staff = validateBreachNotice({ ...base, clientName: 'Pat', clientReference: 'X1' })
    expect(staff.ok && staff.value.clientName).toBeNull()
    expect(staff.ok && staff.value.clientReference).toBeNull()

    const client = validateBreachNotice({
      ...base,
      subjectType: 'CLIENT',
      clientName: 'Pat',
      clientReference: 'X1',
    })
    expect(client.ok && client.value.clientName).toBe('Pat')
    expect(client.ok && client.value.clientReference).toBe('X1')
  })
})

describe('attachment helpers', () => {
  it('treats every non-PDF file as a photo', () => {
    expect(isBreachPhoto('/api/upload/a.jpg')).toBe(true)
    expect(isBreachPhoto('/api/upload/ticket.PDF?x=1')).toBe(false)
    expect(firstPhotoUrl(['/api/upload/ticket.pdf', '/api/upload/a.jpg'])).toBe('/api/upload/a.jpg')
  })
})

describe('duplicate identity', () => {
  it('uses a client reference when there is one', () => {
    expect(
      breachDuplicateKey({ subjectType: 'CLIENT', clientReference: ' ab-12 ', numberplate: 'ABC123', breachDate: '2026-11-01' }),
    ).toBe('REF:AB-12')
  })

  it('falls back to the plate + breach date', () => {
    expect(
      breachDuplicateKey({ subjectType: 'STAFF', numberplate: 'ab 123', breachDate: '2026-11-01' }),
    ).toBe('PLATE:AB123|2026-11-01')
  })
})

describe('status transitions', () => {
  it('maps review buttons to terminal statuses', () => {
    expect(reviewActionToStatus('WAIVE')).toBe('WAIVED')
    expect(reviewActionToStatus('DECLINE')).toBe('DECLINED')
    expect(reviewActionToStatus('PAID')).toBe('PAID')
  })

  it('only allows a SUBMITTED notice to move', () => {
    expect(reviewTransitionError('SUBMITTED')).toBeNull()
    for (const status of ['WAIVED', 'DECLINED', 'PAID', 'WITHDRAWN']) {
      expect(reviewTransitionError(status)).toBe('THIS NOTICE HAS ALREADY BEEN CLOSED')
      expect(isClosedStatus(status)).toBe(true)
    }
  })

  it('requires a reason for every review action', () => {
    expect(reviewReasonError('   ')).toBe('ADD A REASON FOR THIS DECISION')
    expect(reviewReasonError('Venue pays this one')).toBeNull()
  })

  it('accepts the action spellings the UI and API send', () => {
    expect(validateReviewAction('WAIVE')).toBe('WAIVE')
    expect(validateReviewAction('waived')).toBe('WAIVE')
    expect(validateReviewAction('MARK PAID')).toBe('PAID')
    expect(validateReviewAction('DECLINED')).toBe('DECLINE')
    expect(validateReviewAction('nope')).toBeNull()
  })
})

describe('descriptions', () => {
  it('renders a plain-English status and summary', () => {
    expect(describeBreachStatus('SUBMITTED')).toBe('AWAITING REVIEW')
    expect(describeBreachStatus('WAIVED')).toBe('WAIVED')
    expect(
      describeBreachNotice({ numberplate: 'ABC123', breachDate: '2026-11-01', status: 'SUBMITTED', subjectType: 'STAFF' }),
    ).toBe('STAFF · ABC123 · 01-11-2026 · AWAITING REVIEW')
  })
})
