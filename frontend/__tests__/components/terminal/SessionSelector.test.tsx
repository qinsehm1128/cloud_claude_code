import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionSelector } from '@/components/terminal/SessionSelector'
import type { ConversationInfo } from '@/types/conversation'

const getContainerConversationsMock = vi.hoisted(() => vi.fn())
const deleteConversationMock = vi.hoisted(() => vi.fn())
const toastSuccessMock = vi.hoisted(() => vi.fn())
const toastErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/api', () => ({
  getContainerConversations: getContainerConversationsMock,
  containerApi: {
    deleteConversation: deleteConversationMock,
  },
}))

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

describe('SessionSelector', () => {
  const onSelect = vi.fn()
  const onCreateNew = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders session cards and triggers callbacks', async () => {
    const sessions: ConversationInfo[] = [
      {
        id: 11,
        title: 'Session A',
        state: 'running',
        is_running: true,
        total_turns: 8,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:30:00Z',
      },
      {
        id: 22,
        title: 'Session B',
        state: 'idle',
        is_running: false,
        total_turns: 2,
        created_at: '2026-02-10T08:00:00Z',
        updated_at: '2026-02-10T08:30:00Z',
      },
    ]

    getContainerConversationsMock.mockResolvedValue(sessions)

    render(
      <SessionSelector
        containerId={3}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(getContainerConversationsMock).toHaveBeenCalledWith(3)
      expect(screen.getByText('Session A')).toBeInTheDocument()
      expect(screen.getByText('Session B')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /new session/i }))
    expect(onCreateNew).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Session A'))
    expect(onSelect).toHaveBeenCalledWith(11)
  })

  it('shows running and idle indicators with expected colors', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 101,
        title: 'Running Session',
        state: 'running',
        is_running: true,
        total_turns: 5,
        created_at: '2026-02-11T07:00:00Z',
        updated_at: '2026-02-11T07:20:00Z',
      },
      {
        id: 102,
        title: 'Idle Session',
        state: 'idle',
        is_running: false,
        total_turns: 1,
        created_at: '2026-02-11T06:00:00Z',
        updated_at: '2026-02-11T06:10:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId={3}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-status-101')).toBeInTheDocument()
      expect(screen.getByTestId('session-status-102')).toBeInTheDocument()
    })

    expect(screen.getByTestId('session-status-101')).toHaveClass('text-emerald-500')
    expect(screen.getByTestId('session-status-102')).toHaveClass('text-gray-400')
  })

  it('renders empty state when no sessions are returned', async () => {
    getContainerConversationsMock.mockResolvedValue([])

    render(
      <SessionSelector
        containerId={8}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('No active sessions.')).toBeInTheDocument()
    })
  })

  it('renders error state and supports retry', async () => {
    getContainerConversationsMock
      .mockRejectedValueOnce(new Error('Container not found'))
      .mockResolvedValueOnce([
        {
          id: 9,
          title: 'Recovered Session',
          state: 'idle',
          is_running: false,
          total_turns: 0,
          created_at: '2026-02-11T05:00:00Z',
          updated_at: '2026-02-11T05:00:00Z',
        },
      ])

    render(
      <SessionSelector
        containerId={7}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Container not found')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('Recovered Session')).toBeInTheDocument()
      expect(getContainerConversationsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('supports responsive grid layout classes', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 1,
        title: 'Session Grid Test',
        state: 'idle',
        is_running: false,
        total_turns: 3,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:00:00Z',
      },
    ])

    const { container } = render(
      <SessionSelector
        containerId={4}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Session Grid Test')).toBeInTheDocument()
    })

    const grid = container.querySelector('[data-testid="session-list"]')
    expect(grid).toHaveClass('grid-cols-1')
    expect(grid).toHaveClass('md:grid-cols-2')
  })

  it('disables create button when container id is missing', () => {
    render(
      <SessionSelector
        containerId={null}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    expect(screen.getByRole('button', { name: /new session/i })).toBeDisabled()
    expect(screen.getByText('Select a container first.')).toBeInTheDocument()
  })

  it('disables delete button for running session', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 301,
        title: 'Running Session',
        state: 'running',
        is_running: true,
        total_turns: 7,
        created_at: '2026-02-11T07:00:00Z',
        updated_at: '2026-02-11T07:10:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId={9}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    const deleteButton = await screen.findByTestId('delete-session-301')
    expect(deleteButton).toBeDisabled()
    expect(deleteConversationMock).not.toHaveBeenCalled()
  })

  it('opens confirm dialog and deletes session successfully', async () => {
    getContainerConversationsMock
      .mockResolvedValueOnce([
        {
          id: 401,
          title: 'Delete Me',
          state: 'idle',
          is_running: false,
          total_turns: 4,
          created_at: '2026-02-11T07:00:00Z',
          updated_at: '2026-02-11T07:10:00Z',
        },
      ])
      .mockResolvedValueOnce([])

    deleteConversationMock.mockResolvedValue(undefined)

    render(
      <SessionSelector
        containerId={5}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    const deleteButton = await screen.findByTestId('delete-session-401')
    fireEvent.click(deleteButton)

    expect(screen.getByRole('heading', { name: /delete session/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deleteConversationMock).toHaveBeenCalledWith(5, 401)
      expect(getContainerConversationsMock).toHaveBeenCalledTimes(2)
      expect(toastSuccessMock).toHaveBeenCalledWith('Success', 'Session deleted successfully')
    })
  })

  it('shows error toast when deleting session fails', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 501,
        title: 'Locked Session',
        state: 'idle',
        is_running: false,
        total_turns: 2,
        created_at: '2026-02-11T07:00:00Z',
        updated_at: '2026-02-11T07:10:00Z',
      },
    ])

    deleteConversationMock.mockRejectedValue(new Error('Conversation is running and cannot be deleted'))

    render(
      <SessionSelector
        containerId={6}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    const deleteButton = await screen.findByTestId('delete-session-501')
    fireEvent.click(deleteButton)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deleteConversationMock).toHaveBeenCalledWith(6, 501)
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Delete Failed',
        'Conversation is running and cannot be deleted'
      )
    })
  })

  it('normalizes string containerId to number', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 1,
        title: 'String ID Test',
        state: 'idle',
        is_running: false,
        total_turns: 0,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:00:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId="42"
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(getContainerConversationsMock).toHaveBeenCalledWith(42)
      expect(screen.getByText('String ID Test')).toBeInTheDocument()
    })
  })

  it('treats non-numeric string containerId as null', () => {
    render(
      <SessionSelector
        containerId="abc"
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    expect(screen.getByText('Select a container first.')).toBeInTheDocument()
    expect(getContainerConversationsMock).not.toHaveBeenCalled()
  })

  it('selects session via keyboard Enter key', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 77,
        title: 'Keyboard Session',
        state: 'idle',
        is_running: false,
        total_turns: 1,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:00:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId={1}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Keyboard Session')).toBeInTheDocument()
    })

    const sessionItem = screen.getByText('Keyboard Session').closest('[role="button"]')!
    fireEvent.keyDown(sessionItem, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(77)
  })

  it('selects session via keyboard Space key', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 88,
        title: 'Space Key Session',
        state: 'idle',
        is_running: false,
        total_turns: 0,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:00:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId={1}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Space Key Session')).toBeInTheDocument()
    })

    const sessionItem = screen.getByText('Space Key Session').closest('[role="button"]')!
    fireEvent.keyDown(sessionItem, { key: ' ' })

    expect(onSelect).toHaveBeenCalledWith(88)
  })

  it('refreshes session list when refresh button is clicked', async () => {
    getContainerConversationsMock
      .mockResolvedValueOnce([
        {
          id: 1,
          title: 'Initial Session',
          state: 'idle',
          is_running: false,
          total_turns: 0,
          created_at: '2026-02-11T08:00:00Z',
          updated_at: '2026-02-11T08:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 1,
          title: 'Initial Session',
          state: 'idle',
          is_running: false,
          total_turns: 0,
          created_at: '2026-02-11T08:00:00Z',
          updated_at: '2026-02-11T08:00:00Z',
        },
        {
          id: 2,
          title: 'New Session',
          state: 'running',
          is_running: true,
          total_turns: 3,
          created_at: '2026-02-11T09:00:00Z',
          updated_at: '2026-02-11T09:30:00Z',
        },
      ])

    render(
      <SessionSelector
        containerId={5}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Initial Session')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
      expect(getContainerConversationsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('sorts sessions by updated_at descending', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 1,
        title: 'Older Session',
        state: 'idle',
        is_running: false,
        total_turns: 0,
        created_at: '2026-02-10T08:00:00Z',
        updated_at: '2026-02-10T08:00:00Z',
      },
      {
        id: 2,
        title: 'Newer Session',
        state: 'idle',
        is_running: false,
        total_turns: 0,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:00:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId={1}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Newer Session')).toBeInTheDocument()
    })

    const sessionList = screen.getByTestId('session-list')
    const sessionItems = sessionList.querySelectorAll('[role="button"]')
    expect(sessionItems[0]).toHaveTextContent('Newer Session')
    expect(sessionItems[1]).toHaveTextContent('Older Session')
  })

  it('shows session fallback title when title is empty', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 55,
        title: '',
        state: 'idle',
        is_running: false,
        total_turns: 0,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:00:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId={1}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Session 55')).toBeInTheDocument()
    })
  })

  it('disables refresh button when container id is null', () => {
    render(
      <SessionSelector
        containerId={null}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()
  })

  it('displays session metadata fields (ID, Turns, Created, State)', async () => {
    getContainerConversationsMock.mockResolvedValue([
      {
        id: 42,
        title: 'Metadata Test',
        state: 'processing',
        is_running: false,
        total_turns: 15,
        created_at: '2026-02-11T08:00:00Z',
        updated_at: '2026-02-11T08:00:00Z',
      },
    ])

    render(
      <SessionSelector
        containerId={1}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByText('processing')).toBeInTheDocument()
    })
  })
})

