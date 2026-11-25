import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TipsAddStaffModal } from '@/components/admin/TipsAddStaffModal'
import type { TipsShareRow, TipsStaffOption } from '@/lib/tips'

const STAFF: TipsStaffOption[] = [
  { id: 's1', name: 'LIAM SMITH', departmentName: 'FOH' },
  { id: 's2', name: 'SHAYLA JONES', departmentName: 'FOH' },
  { id: 's3', name: 'RUI CHEN', departmentName: 'KITCHEN' },
]

const share = (staffId: string): TipsShareRow => ({
  staffId,
  name: 'LIAM SMITH',
  hours: 0,
  shareWeight: 1,
  sortOrder: 0,
  status: 'PLANNED',
})

function renderModal(shares: TipsShareRow[] = [share('s1')]) {
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(<TipsAddStaffModal staff={STAFF} shares={shares} onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose }
}

describe('TipsAddStaffModal', () => {
  it('disables people already on the period and adds only the selection', () => {
    const { onAdd, onClose } = renderModal()

    expect((screen.getByLabelText('Select LIAM SMITH') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Select RUI CHEN'))
    fireEvent.click(screen.getByText('ADD SELECTED (1)'))

    expect(onAdd).toHaveBeenCalledWith([STAFF[2]])
    expect(onClose).toHaveBeenCalled()
  })

  it('filters the list by department without selecting past the disabled rows', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Filter by department'), { target: { value: 'KITCHEN' } })

    expect(screen.queryByText('SHAYLA JONES')).toBeNull()
    expect(screen.getByText('RUI CHEN')).toBeTruthy()
    fireEvent.click(screen.getByText('SELECT ALL'))
    expect(screen.getByText('ADD SELECTED (1)')).toBeTruthy()
  })

  it('adds every active person not already on the period', () => {
    const { onAdd } = renderModal()

    fireEvent.click(screen.getByText('ADD ALL ACTIVE'))

    expect(onAdd).toHaveBeenCalledWith([STAFF[1], STAFF[2]])
  })

  it('disables ADD ALL ACTIVE when everyone is already on the period', () => {
    renderModal([share('s1'), share('s2'), share('s3')])
    expect((screen.getByText('ADD ALL ACTIVE').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
