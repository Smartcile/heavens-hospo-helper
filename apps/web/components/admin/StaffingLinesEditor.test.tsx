import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  StaffingLinesEditor,
  staffingPayload,
  staffingLineCount,
  draftFromStaffingLine,
  type StaffingDraftLine,
} from '@/components/admin/StaffingLinesEditor'

const positions = [{ id: 'p1', name: 'BARISTA' }]

function draft(partial: Partial<StaffingDraftLine>): StaffingDraftLine {
  return {
    key: 'k1',
    positionId: '',
    label: '',
    count: '1',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: '0',
    note: '',
    ...partial,
  }
}

describe('staffingPayload', () => {
  it('drops unnamed rows and maps counts to the API shape', () => {
    const payload = staffingPayload([
      draft({ positionId: 'p1', count: '3', startTime: '08:00', endTime: '12:00' }),
      draft({ key: 'k2' }), // no position or label — ignored
      draft({ key: 'k3', label: 'DOOR HOST', count: '2' }),
    ])
    expect(payload).toHaveLength(2)
    expect(payload[0]).toMatchObject({ positionId: 'p1', label: null, count: 3, startTime: '08:00', endTime: '12:00', sortOrder: 0 })
    expect(payload[1]).toMatchObject({ positionId: null, label: 'DOOR HOST', count: 2, sortOrder: 1 })
  })

  it('counts only named rows for the FIND STAFF summary', () => {
    expect(staffingLineCount([draft({ positionId: 'p1', count: '3' }), draft({ key: 'k2' }), draft({ key: 'k3', label: 'X', count: '2' })])).toBe(5)
  })
})

describe('draftFromStaffingLine', () => {
  it('maps a saved line into editable draft fields', () => {
    expect(
      draftFromStaffingLine(
        { id: 'sl1', positionId: 'p1', label: null, count: 2, startTime: '09:00', endTime: '13:00', breakMinutes: 30, note: 'DOORS' },
        0,
      ),
    ).toMatchObject({ key: 'sl1', positionId: 'p1', label: '', count: '2', breakMinutes: '30', note: 'DOORS' })
  })
})

describe('StaffingLinesEditor', () => {
  it('renders a row per line with position options and removes on ✕', () => {
    const onChange = vi.fn()
    const { container } = render(
      <StaffingLinesEditor lines={[draft({ positionId: 'p1', label: 'X' })]} positions={positions} onChange={onChange} />,
    )
    expect(screen.getByText('BARISTA')).toBeDefined()
    const remove = container.querySelector('button')!
    fireEvent.click(remove)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('shows the empty hint without lines', () => {
    render(<StaffingLinesEditor lines={[]} positions={positions} onChange={() => {}} />)
    expect(screen.getByText(/NO ROLES YET/)).toBeDefined()
  })
})
