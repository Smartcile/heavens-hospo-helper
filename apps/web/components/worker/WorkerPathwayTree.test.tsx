import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkerPathwayTree, type TreeNode } from '@/components/worker/WorkerPathwayTree'

// jsdom has no ResizeObserver; the tree uses one to re-measure its connectors.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function node(over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 'n1',
    kind: 'GUIDE',
    title: 'ESPRESSO 101',
    stage: 0,
    points: 10,
    status: 'AVAILABLE',
    blockedBy: [],
    ...over,
  }
}

describe('WorkerPathwayTree', () => {
  it('shows an empty message when there are no nodes', () => {
    render(<WorkerPathwayTree nodes={[]} edges={[]} onOpen={vi.fn()} />)
    expect(screen.getByText('THIS PATHWAY HAS NO STEPS YET.')).toBeTruthy()
  })

  it('renders a node with its title and points', () => {
    render(<WorkerPathwayTree nodes={[node()]} edges={[]} onOpen={vi.fn()} />)
    expect(screen.getByText('ESPRESSO 101')).toBeTruthy()
    expect(screen.getByText(/10P/)).toBeTruthy()
  })

  it('groups nodes into stage columns', () => {
    render(
      <WorkerPathwayTree
        nodes={[node({ id: 'a', stage: 0 }), node({ id: 'b', title: 'LATTE ART', stage: 1 })]}
        edges={[]}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('STAGE 1')).toBeTruthy()
    expect(screen.getByText('STAGE 2')).toBeTruthy()
  })

  // The whole point of the tree: a locked node must say what unlocks it.
  it('names the blocking node on a locked card', () => {
    render(
      <WorkerPathwayTree
        nodes={[
          node({ id: 'a', title: 'ESPRESSO 101', status: 'DONE' }),
          node({ id: 'b', title: 'LATTE ART', status: 'LOCKED', blockedBy: ['a'], stage: 1 }),
        ]}
        edges={[{ fromNodeId: 'a', toNodeId: 'b' }]}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText(/NEEDS: ESPRESSO 101/)).toBeTruthy()
  })

  it('does not show a NEEDS line on an available node', () => {
    render(<WorkerPathwayTree nodes={[node()]} edges={[]} onOpen={vi.fn()} />)
    expect(screen.queryByText(/NEEDS:/)).toBeNull()
  })

  // Locked nodes stay readable — the bible gives access to everything anyway,
  // so opening one must still work.
  it('still calls onOpen for a locked node', () => {
    const onOpen = vi.fn()
    render(
      <WorkerPathwayTree
        nodes={[node({ status: 'LOCKED', blockedBy: [] })]}
        edges={[]}
        onOpen={onOpen}
      />,
    )
    fireEvent.click(screen.getByText('ESPRESSO 101'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('labels a milestone distinctly', () => {
    render(
      <WorkerPathwayTree
        nodes={[node({ kind: 'MILESTONE', title: 'BASIC BARISTA', points: 50 })]}
        edges={[]}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('★ MILESTONE')).toBeTruthy()
  })

  it('renders a checklist node as LIST', () => {
    render(<WorkerPathwayTree nodes={[node({ kind: 'CHECKLIST' })]} edges={[]} onOpen={vi.fn()} />)
    expect(screen.getByText('LIST')).toBeTruthy()
  })

  it('ignores an edge pointing at a node that is not rendered', () => {
    expect(() =>
      render(
        <WorkerPathwayTree
          nodes={[node()]}
          edges={[{ fromNodeId: 'ghost', toNodeId: 'n1' }]}
          onOpen={vi.fn()}
        />,
      ),
    ).not.toThrow()
  })
})
