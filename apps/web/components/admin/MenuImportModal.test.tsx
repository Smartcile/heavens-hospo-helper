import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuImportModal } from '@/components/admin/MenuImportModal'

const answer = JSON.stringify({
  menu: {
    name: 'DINNER',
    description: null,
    groups: [{
      name: 'MAINS',
      items: [
        { name: 'STEAK', price: 32.5, description: null, dietary: ['MILK'] },
        { name: 'FISH', price: 28, description: null, dietary: [] },
      ],
    }],
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

describe('MenuImportModal', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('parses the answer into a preview with match badges', async () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Pasted LLM answer'), { target: { value: answer } })
    fireEvent.click(screen.getByText('PARSE ANSWER'))

    expect(await screen.findByText('MAINS')).toBeDefined()
    expect(screen.getByText('STEAK')).toBeDefined()
    expect(screen.getByText('MATCH')).toBeDefined()
    expect(screen.getByText('NEW')).toBeDefined()
    expect(screen.getByText(/IMPORT 2 ITEMS/)).toBeDefined()
  })

  it('commits only the selected items to a new menu', async () => {
    const posts: unknown[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return { ok: true, json: async () => ({ menuId: 'm9' }) } as Response
    })
    const { onImported } = renderModal()

    fireEvent.change(screen.getByLabelText('Pasted LLM answer'), { target: { value: answer } })
    fireEvent.click(screen.getByText('PARSE ANSWER'))
    await screen.findByText('STEAK')

    // Uncheck STEAK — only FISH should import.
    const steakRow = screen.getByText('STEAK').closest('label') as HTMLElement
    fireEvent.click(steakRow.querySelector('input[type="checkbox"]') as HTMLInputElement)
    expect(screen.getByText(/IMPORT 1 ITEM/)).toBeDefined()

    fireEvent.click(screen.getByText(/IMPORT 1 ITEM/))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      venueId: 'v1',
      menuName: 'DINNER',
      data: { name: 'DINNER', groups: [{ name: 'MAINS', items: [{ name: 'FISH' }] }] },
    })
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('m9'))
  })

  it('appends to an existing menu when chosen', async () => {
    const posts: unknown[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return { ok: true, json: async () => ({ menuId: 'm1' }) } as Response
    })
    renderModal()

    fireEvent.change(screen.getByLabelText('Pasted LLM answer'), { target: { value: answer } })
    fireEvent.click(screen.getByText('PARSE ANSWER'))
    await screen.findByText('STEAK')

    fireEvent.click(screen.getByText('ADD TO EXISTING'))
    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[selects.length - 1], { target: { value: 'm1' } })
    fireEvent.click(screen.getByText(/IMPORT 2 ITEMS/))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ menuId: 'm1' })
  })
})
