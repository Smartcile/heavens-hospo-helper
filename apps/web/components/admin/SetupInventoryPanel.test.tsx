import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetupInventoryPanel } from '@/components/admin/SetupInventoryPanel'

describe('SetupInventoryPanel', () => {
  it('renders CHECK button', () => {
    render(
      <SetupInventoryPanel activeSetupId="s1" shortages={null} onCheck={vi.fn()} checking={false} />
    )
    expect(screen.getByText('CHECK')).toBeTruthy()
  })

  it('shows CLICK CHECK message when no results', () => {
    render(
      <SetupInventoryPanel activeSetupId="s1" shortages={null} onCheck={vi.fn()} checking={false} />
    )
    expect(screen.getByText('CLICK CHECK TO RUN INVENTORY AUDIT')).toBeTruthy()
  })

  it('shows ALL ITEMS SUFFICIENT when empty array', () => {
    render(
      <SetupInventoryPanel activeSetupId="s1" shortages={[]} onCheck={vi.fn()} checking={false} />
    )
    expect(screen.getByText('ALL ITEMS SUFFICIENT')).toBeTruthy()
  })

  it('shows shortage list with item names', () => {
    render(
      <SetupInventoryPanel
        activeSetupId="s1"
        shortages={[
          { itemId: 'a', itemName: 'FORK', required: 20, available: 10, shortage: 10 },
          { itemId: 'b', itemName: 'CHAIR', required: 40, available: 30, shortage: 10 },
        ]}
        onCheck={vi.fn()}
        checking={false}
      />
    )
    expect(screen.getByText(/FORK — 10 SHORT/)).toBeTruthy()
    expect(screen.getByText(/20 REQUIRED/)).toBeTruthy()
    expect(screen.getByText(/CHAIR — 10 SHORT/)).toBeTruthy()
  })

  it('shows SELECT SETUP message when no setup active', () => {
    render(
      <SetupInventoryPanel activeSetupId={null} shortages={null} onCheck={vi.fn()} checking={false} />
    )
    expect(screen.getByText('SELECT A SETUP TO CHECK INVENTORY')).toBeTruthy()
  })

  it('fires onCheck when CHECK button clicked', () => {
    const onCheck = vi.fn()
    render(
      <SetupInventoryPanel activeSetupId="s1" shortages={null} onCheck={onCheck} checking={false} />
    )
    fireEvent.click(screen.getByText('CHECK'))
    expect(onCheck).toHaveBeenCalledOnce()
  })

  it('disables CHECK button when busy', () => {
    render(
      <SetupInventoryPanel activeSetupId="s1" shortages={null} onCheck={vi.fn()} checking={true} />
    )
    expect(screen.getByText('CHECKING...')).toBeTruthy()
  })
})
