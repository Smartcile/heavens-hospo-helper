import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TableProfilesClient } from '@/app/admin/(protected)/table-profiles/TableProfilesClient'

describe('TableProfilesClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response)) as typeof fetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state on mount', () => {
    render(<TableProfilesClient />)
    expect(screen.getByText('LOADING TABLE PROFILES...')).toBeTruthy()
  })

  it('renders without crashing (hooks ordered correctly)', () => {
    const { container } = render(<TableProfilesClient />)
    expect(container).toBeTruthy()
  })

  it('calls fetch to load profiles and inventory on mount', () => {
    render(<TableProfilesClient />)
    expect(fetch).toHaveBeenCalledWith('/api/admin/table-profiles')
    expect(fetch).toHaveBeenCalledWith('/api/admin/inventory')
  })

  it('renders the TABLE PROFILES heading after load', async () => {
    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'tp-1', name: 'TABLE 1', type: 'TABLE', capacity: 4, width: 80, depth: 80, shape: 'RECTANGLE', colour: '#555', chairCount: 4, seatingDensity: 60, maxHeadChairs: 1, isActive: true, bomItems: [] },
      ],
    })
    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
    render(<TableProfilesClient />)
    await waitFor(() => {
      expect(screen.getByText('TABLE 1')).toBeTruthy()
    })
  })

  it('renders + ADD button', async () => {
    render(<TableProfilesClient />)
    await waitFor(() => {
      expect(screen.getByText('+ ADD')).toBeTruthy()
    })
  })

  it('shows NO PROFILES YET when list is empty', async () => {
    render(<TableProfilesClient />)
    await waitFor(() => {
      expect(screen.getByText('NO PROFILES YET')).toBeTruthy()
    })
  })

  it('shows SELECT A PROFILE message when none selected', async () => {
    render(<TableProfilesClient />)
    await waitFor(() => {
      expect(screen.getByText('SELECT A PROFILE OR CLICK + ADD TO CREATE ONE')).toBeTruthy()
    })
  })

  it('clicking + ADD shows NEW TABLE PROFILE form', async () => {
    render(<TableProfilesClient />)
    await waitFor(() => {
      fireEvent.click(screen.getByText('+ ADD'))
    })
    expect(screen.getByText('NEW TABLE PROFILE')).toBeTruthy()
  })

  it('shows profile details when clicked', async () => {
    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'tp-1', name: 'TABLE 1', type: 'TABLE', capacity: 4, width: 80, depth: 80, shape: 'RECTANGLE', colour: '#555', chairCount: 4, seatingDensity: 60, maxHeadChairs: 1, isActive: true, bomItems: [] },
      ],
    })
    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
    render(<TableProfilesClient />)
    await waitFor(() => {
      fireEvent.click(screen.getByText('TABLE 1'))
    })
    await waitFor(() => {
      expect(screen.getByText('PROPERTIES')).toBeTruthy()
    })
  })

  it('clicking ADD shows form fields', async () => {
    render(<TableProfilesClient />)
    await waitFor(() => {
      fireEvent.click(screen.getByText('+ ADD'))
    })
    expect(screen.getByText('BILL OF MATERIALS (0)')).toBeTruthy()
    expect(screen.getByText('SAVE')).toBeTruthy()
    expect(screen.getByText('CANCEL')).toBeTruthy()
  })
})
