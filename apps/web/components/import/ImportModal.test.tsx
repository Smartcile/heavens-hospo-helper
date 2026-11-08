import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportModal } from './ImportModal'

interface TestValues {
  name: string
  yieldQty: number
  yieldUnit: string
  lines: unknown[]
  replaceLines: boolean
}

interface MenuValues {
  name: string
  price: number | null
}

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function goToPreview(text = '{}') {
  fireEvent.click(screen.getByText('NEXT'))
  fireEvent.change(screen.getByPlaceholderText('PASTE THE JSON ANSWER HERE...'), { target: { value: text } })
  fireEvent.click(screen.getByText('PREVIEW'))
}

describe('ImportModal (shared shell)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      json({ created: 1, updated: 0, revived: 0, skipped: 0, warnings: [] }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('previews generic rows, patches row values and posts to the given endpoint', async () => {
    const parse = vi.fn(() => ({
      rows: [{
        id: 'r0',
        values: { name: 'ROAST', yieldQty: 4, yieldUnit: 'PORTION', lines: [], replaceLines: false },
        include: true,
        action: 'CREATE' as const,
        issues: [],
      }],
      issues: [],
    }))

    render(
      <ImportModal<TestValues>
        title="IMPORT RECIPES"
        prompt="PROMPT TEXT"
        existing={[]}
        parse={parse}
        endpoint="/api/admin/import/recipes"
        venueId="v1"
        renderSummary={(v) => ({ title: v.name, meta: `${v.lines.length} LINES` })}
        renderRowControls={(row, patch) => (
          <label>
            <input
              type="checkbox"
              aria-label="REPLACE LINES"
              checked={row.values.replaceLines}
              onChange={(e) => patch({ replaceLines: e.target.checked })}
            />
            REPLACE LINES
          </label>
        )}
        onClose={() => {}}
        onImported={() => {}}
      />,
    )

    goToPreview()

    await screen.findByText('ROAST')
    expect(screen.getByText('0 LINES')).toBeDefined()

    fireEvent.click(screen.getByLabelText('REPLACE LINES'))
    fireEvent.click(screen.getByText('IMPORT SELECTED'))

    await waitFor(() => {
      const call = vi.mocked(global.fetch).mock.calls.find(
        ([url]) => String(url) === '/api/admin/import/recipes',
      )
      expect(call).toBeDefined()
      const body = JSON.parse(String((call![1] as RequestInit).body))
      expect(body.venueId).toBe('v1')
      expect(body.rows[0].values.replaceLines).toBe(true)
    })
  })

  it('keeps the menu-item default summary (name + price)', async () => {
    const parse = vi.fn(() => ({
      rows: [{
        id: 'i0',
        values: { name: 'FISH', price: 16.5 },
        include: true,
        action: 'CREATE' as const,
        issues: [],
      }],
      issues: [],
    }))

    render(
      <ImportModal<MenuValues>
        title="IMPORT MENU ITEMS"
        prompt="PROMPT"
        existing={[]}
        parse={parse}
        endpoint="/api/admin/import/menu-items"
        onClose={() => {}}
        onImported={() => {}}
      />,
    )

    goToPreview()

    await screen.findByText('FISH')
    expect(screen.getByText('$16.50')).toBeDefined()
  })

  it('shows a parse error and stays on the paste step', async () => {
    const parse = vi.fn(() => ({ error: 'NO JSON FOUND IN THE ANSWER' }))

    render(
      <ImportModal<MenuValues>
        title="IMPORT"
        prompt="PROMPT"
        existing={[]}
        parse={parse}
        endpoint="/api/admin/import/menu-items"
        onClose={() => {}}
        onImported={() => {}}
      />,
    )

    goToPreview('nonsense')

    await screen.findByText('NO JSON FOUND IN THE ANSWER')
    expect(screen.queryByText('IMPORT SELECTED')).toBeNull()
  })
})
