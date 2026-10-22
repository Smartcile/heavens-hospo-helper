import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { OutcomeOptions } from '@/components/ui/OutcomeOptions'

describe('OutcomeOptions', () => {
  it('always shows DONE as fixed and toggles optional outcomes', () => {
    const onChange = vi.fn()
    const { getByText } = render(
      <OutcomeOptions allowed={['DONE']} requireReason={false} onChange={onChange} />,
    )
    expect(getByText('DONE · always')).toBeTruthy()
    fireEvent.click(getByText('PARTIAL'))
    expect(onChange).toHaveBeenCalledWith(['DONE', 'PARTIAL'], false)
  })

  it('toggles the reason requirement without dropping the outcomes', () => {
    const onChange = vi.fn()
    const { getByLabelText } = render(
      <OutcomeOptions allowed={['DONE', 'NOT_REQUIRED']} requireReason={false} onChange={onChange} />,
    )
    fireEvent.click(getByLabelText('Require a reason for non-DONE outcomes'))
    expect(onChange).toHaveBeenCalledWith(['DONE', 'NOT_REQUIRED'], true)
  })

  it('shows the inherited state when a task is not overriding', () => {
    const { getByText, queryByText } = render(
      <OutcomeOptions
        allowed={['DONE', 'PARTIAL']}
        requireReason
        onChange={() => {}}
        canOverride
        override={false}
        onOverrideChange={() => {}}
      />,
    )
    expect(getByText('USES THE CHECKLIST / DEFAULT OUTCOME OPTIONS')).toBeTruthy()
    expect(queryByText('PARTIAL')).toBeNull()
  })

  it('shows custom controls when the task overrides', () => {
    const { getByText } = render(
      <OutcomeOptions
        allowed={['DONE', 'DID_NOT_COMPLETE']}
        requireReason
        onChange={() => {}}
        canOverride
        override
        onOverrideChange={() => {}}
      />,
    )
    expect(getByText('DID NOT COMPLETE')).toBeTruthy()
  })
})
