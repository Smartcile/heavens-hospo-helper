import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuImportModal } from '@/components/admin/MenuImportModal'

const answer = JSON.stringify({
  menu: {
    name: 'DINNER',
    description: null,
    groups: [
      {
        name: 'MAINS',
        area: 'RESTAURANT',
        items: [
          {
            name: 'STEAK',
            price: 32.5,
            description: 'grilled',
            dietary: ['MILK'],
            sizes: [{ label: '300G', price: 32.5 }],
            options: [{
              name: 'SIDE',
              required: true,
              min: 1,
              max: 1,
              choices: [
                { name: 'FRIES', priceDelta: 0 },
                { name: 'SALAD', priceDelta: '$3' },
              ],
            }],
          },
          { name: 'FISH', price: 28, description: 'battered' },
        ],
      },
      {
        name: 'SIDES',
        area: 'BAR',
        items: [{ name: 'FRIES', price: 6, description: 'shoestring' }],
      },
    ],
  },
})

function renderModal(props: Partial<Parameters<typeof MenuImportModal>[0]> = {}) {
  const onImported = vi.fn()
  const onClose = vi.fn()
  render(
    <MenuImportModal
      venueId="v1"
      menus={[{ id: 'm1', name: 'DINNER' }]}
      products={[{ id: 'p1', name: 'STEAK' }]}
      onClose={onClose}
      onImported={onImported}
      {...props}
    />,
  )
  return { onImported, onClose }
}

async function parseAnswer() {
  fireEvent.change(screen.getByLabelText('Pasted LLM answer'), { target: { value: answer } })
  fireEvent.click(screen.getByText('PARSE ANSWER'))
  await screen.findByLabelText('Group name g0')
}

describe('MenuImportModal', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows area, sizes, option deltas and the import notes', async () => {
    renderModal()
    await parseAnswer()

    expect(screen.getByDisplayValue('RESTAURANT')).toBeInTheDocument()
    expect(screen.getByDisplayValue('BAR')).toBeInTheDocument()
    expect(screen.getByText(/SIZES: 300G \$32\.50/)).toBeInTheDocument()
    expect(screen.getByText(/SIDE · REQUIRED: FRIES \$0 \/ SALAD \+\$3\.00/)).toBeInTheDocument()
    expect(screen.getByText('DIETARY NOT IMPORTED — ALLERGENS COME FROM THE PRODUCT')).toBeInTheDocument()
    expect(screen.getByText('OPTIONS ARE IMPORTED — EXISTING PRODUCTS GAIN ONLY MISSING GROUPS/CHOICES')).toBeInTheDocument()
    // The parsed dietary value must never reach the rendered preview (the raw
    // pasted answer textarea still contains the operator's input).
    expect(screen.queryByText(/MILK/, { selector: 'span,p' })).toBeNull()
    expect(screen.getByText('MATCH')).toBeInTheDocument()
    expect(screen.getByText(/IMPORT 3 ITEMS/)).toBeInTheDocument()
  })

  it('commits renames, moves and reorders from the preview', async () => {
    const posts: unknown[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return {
        ok: true,
        json: async () => ({
          menuId: 'm9', created: 0, matched: 3, linesAdded: 0, linesUpdated: 3, skipped: 0, warnings: [],
        }),
      } as Response
    })
    renderModal()
    await parseAnswer()

    fireEvent.change(screen.getByLabelText('Group name g0'), { target: { value: 'entrees' } })
    fireEvent.change(screen.getByLabelText('Item name g0_i0'), { target: { value: 'steak special' } })
    // Move FISH from MAINS into SIDES.
    fireEvent.change(screen.getByLabelText('Move item g0_i1'), { target: { value: 'g1' } })
    // FRIES (still first in SIDES) is reordered below FISH.
    fireEvent.click(screen.getByLabelText('Move item g1_i0 down'))
    // Put SIDES above ENTREES.
    fireEvent.click(screen.getByLabelText('Move group g1 up'))

    fireEvent.click(screen.getByText(/IMPORT 3 ITEMS/))

    await waitFor(() => expect(posts).toHaveLength(1))
    const body = posts[0] as {
      data: { groups: { name: string; area: string | null; items: { name: string }[] }[] }
    }
    expect(body.data.groups.map((g) => g.name)).toEqual(['SIDES', 'ENTREES'])
    expect(body.data.groups[0].items.map((i) => i.name)).toEqual(['FISH', 'FRIES'])
    expect(body.data.groups[1].items.map((i) => i.name)).toEqual(['STEAK SPECIAL'])
    expect(JSON.stringify(body)).not.toContain('dietary')
  })

  it('commits only the ticked items', async () => {
    const posts: unknown[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return { ok: true, json: async () => ({ menuId: 'm9' }) } as Response
    })
    renderModal()
    await parseAnswer()

    fireEvent.click(screen.getByLabelText('Include g0_i0'))
    expect(screen.getByText(/IMPORT 2 ITEMS/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/IMPORT 2 ITEMS/))

    await waitFor(() => expect(posts).toHaveLength(1))
    const body = posts[0] as { data: { groups: { items: { name: string }[] }[] } }
    expect(body.data.groups[0].items.map((i) => i.name)).toEqual(['FISH'])
  })

  it('renders the import summary and only closes on DONE', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        menuId: 'm9',
        created: 1,
        matched: 2,
        linesAdded: 3,
        linesUpdated: 4,
        skipped: 5,
        optionGroupsAdded: 2,
        optionChoicesAdded: 6,
        optionsSkipped: 1,
        warnings: ['DIETARY NOT IMPORTED — ALLERGENS COME FROM THE PRODUCT', 'AMBIGUOUS NAME "FISH" — 2 PRODUCTS, SKIPPED'],
      }),
    }) as Response)
    const { onImported } = renderModal()
    await parseAnswer()

    fireEvent.click(screen.getByText(/IMPORT 3 ITEMS/))

    expect(await screen.findByText('IMPORT SUMMARY')).toBeInTheDocument()
    expect(screen.getByText('LINES UPDATED')).toBeInTheDocument()
    expect(screen.getByText('OPTION GROUPS ADDED')).toBeInTheDocument()
    expect(screen.getByText('OPTION CHOICES ADDED')).toBeInTheDocument()
    expect(screen.getByText('OPTIONS SKIPPED')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/AMBIGUOUS NAME "FISH"/)).toBeInTheDocument()
    expect(onImported).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('DONE'))
    expect(onImported).toHaveBeenCalledWith('m9')
  })

  it('appends to an existing menu when chosen', async () => {
    const posts: unknown[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return { ok: true, json: async () => ({ menuId: 'm1' }) } as Response
    })
    renderModal()
    await parseAnswer()

    fireEvent.click(screen.getByText('ADD TO EXISTING'))
    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[selects.length - 1], { target: { value: 'm1' } })
    fireEvent.click(screen.getByText(/IMPORT 3 ITEMS/))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ menuId: 'm1' })
  })
})
