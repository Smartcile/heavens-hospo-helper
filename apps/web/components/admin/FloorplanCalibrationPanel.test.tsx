import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { FloorplanCalibrationPanel } from '@/components/admin/FloorplanCalibrationPanel'

const base = {
  isOpen: true,
  points: [] as { x: number; y: number }[],
  distance: '',
  imageSize: { width: 1000, height: 750 },
  error: '',
  onDistanceChange: vi.fn(),
  onReset: vi.fn(),
  onApply: vi.fn(),
  onCancel: vi.fn(),
}

describe('FloorplanCalibrationPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<FloorplanCalibrationPanel {...base} isOpen={false} />)
    expect(container.firstChild).toBeNull()
    cleanup()
  })

  it('lists the picked points and the image size', () => {
    const { getByText } = render(
      <FloorplanCalibrationPanel {...base} points={[{ x: 100, y: 200 }, { x: 300, y: 200 }]} />,
    )
    expect(getByText('POINTS: 2/2')).toBeTruthy()
    expect(getByText('P1 100,200')).toBeTruthy()
    expect(getByText('P2 300,200')).toBeTruthy()
    expect(getByText('IMAGE: 1000×750 PX')).toBeTruthy()
    cleanup()
  })

  it('disables APPLY until two points and a real distance exist', () => {
    const { getByText, rerender } = render(<FloorplanCalibrationPanel {...base} />)
    const apply = getByText('APPLY CALIBRATION').closest('button') as HTMLButtonElement
    expect(apply.disabled).toBe(true)

    rerender(<FloorplanCalibrationPanel {...base} points={[{ x: 0, y: 0 }, { x: 100, y: 0 }]} distance="400" />)
    expect((getByText('APPLY CALIBRATION').closest('button') as HTMLButtonElement).disabled).toBe(false)
    cleanup()
  })

  it('disables APPLY while the image size is still loading', () => {
    const { getByText } = render(
      <FloorplanCalibrationPanel
        {...base}
        points={[{ x: 0, y: 0 }, { x: 100, y: 0 }]}
        distance="400"
        imageSize={null}
      />,
    )
    expect((getByText('APPLY CALIBRATION').closest('button') as HTMLButtonElement).disabled).toBe(true)
    expect(getByText('LOADING IMAGE…')).toBeTruthy()
    cleanup()
  })

  it('wires the distance, reset, apply and cancel actions', () => {
    const onDistanceChange = vi.fn()
    const onReset = vi.fn()
    const onApply = vi.fn()
    const onCancel = vi.fn()
    const props = {
      ...base,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      distance: '',
      onDistanceChange,
      onReset,
      onApply,
      onCancel,
    }
    const { getByText, container, rerender } = render(<FloorplanCalibrationPanel {...props} />)
    fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: '450' } })
    expect(onDistanceChange).toHaveBeenCalledWith('450')

    // The parent owns the distance value, so re-render with it before APPLY.
    rerender(<FloorplanCalibrationPanel {...props} distance="450" />)
    fireEvent.click(getByText('RESET POINTS'))
    expect(onReset).toHaveBeenCalled()
    fireEvent.click(getByText('APPLY CALIBRATION'))
    expect(onApply).toHaveBeenCalled()
    fireEvent.click(getByText('CANCEL'))
    expect(onCancel).toHaveBeenCalled()
    cleanup()
  })

  it('shows a validation error', () => {
    const { getByText } = render(<FloorplanCalibrationPanel {...base} error="CLICK TWO POINTS ON THE IMAGE." />)
    expect(getByText('CLICK TWO POINTS ON THE IMAGE.')).toBeTruthy()
    cleanup()
  })
})
