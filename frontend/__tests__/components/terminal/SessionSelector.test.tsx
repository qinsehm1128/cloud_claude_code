import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionSelector } from '@/components/terminal/SessionSelector'
import type { TerminalSessionInfo } from '@/types/conversation'

const getTerminalSessionsMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/api', () => ({
  getTerminalSessions: getTerminalSessionsMock,
}))

function createSession(overrides: Partial<TerminalSessionInfo> = {}): TerminalSessionInfo {
  return {
    id: 'exec-abc123',
    container_id: 'container-1',
    width: 120,
    height: 40,
    client_count: 1,
    created_at: '2026-02-11T08:00:00Z',
    last_active: '2026-02-11T08:30:00Z',
    running: true,
    ...overrides,
  }
}

describe('SessionSelector', () => {
  const onSelect = vi.fn()
  const onCreateNew = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads terminal sessions and supports selecting a session', async () => {
    getTerminalSessionsMock.mockResolvedValue([
      createSession({ id: 'exec-running', client_count: 2, running: true }),
      createSession({ id: 'exec-idle', client_count: 1, running: false }),
    ])

    render(
      <SessionSelector
        containerId={3}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(getTerminalSessionsMock).toHaveBeenCalledWith(3)
      expect(screen.getByText('2 connected')).toBeInTheDocument()
      expect(screen.getByText('1 connected')).toBeInTheDocument()
    })

    const runningSessionItem = screen
      .getByTestId('session-status-exec-running')
      .closest('[role="button"]')

    expect(runningSessionItem).not.toBeNull()
    fireEvent.click(runningSessionItem!)

    expect(onSelect).toHaveBeenCalledWith('exec-running')
  })

  it('supports keyboard selection with Enter and Space', async () => {
    getTerminalSessionsMock.mockResolvedValue([
      createSession({ id: 'exec-keyboard' }),
    ])

    render(
      <SessionSelector
        containerId={9}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-status-exec-keyboard')).toBeInTheDocument()
    })

    const sessionItem = screen
      .getByTestId('session-status-exec-keyboard')
      .closest('[role="button"]')

    expect(sessionItem).not.toBeNull()

    fireEvent.keyDown(sessionItem!, { key: 'Enter' })
    fireEvent.keyDown(sessionItem!, { key: ' ' })

    expect(onSelect).toHaveBeenNthCalledWith(1, 'exec-keyboard')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'exec-keyboard')
  })

  it('shows running and stopped status indicators', async () => {
    getTerminalSessionsMock.mockResolvedValue([
      createSession({ id: 'exec-online', running: true }),
      createSession({ id: 'exec-offline', running: false }),
    ])

    render(
      <SessionSelector
        containerId={6}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-status-exec-online')).toBeInTheDocument()
      expect(screen.getByTestId('session-status-exec-offline')).toBeInTheDocument()
    })

    expect(screen.getByTestId('session-status-exec-online')).toHaveClass('text-emerald-500')
    expect(screen.getByTestId('session-status-exec-offline')).toHaveClass('text-gray-400')
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('renders metadata fields for each terminal session', async () => {
    getTerminalSessionsMock.mockResolvedValue([
      createSession({
        id: 'exec-meta',
        container_id: 'docker-container',
        width: 132,
        height: 36,
      }),
    ])

    render(
      <SessionSelector
        containerId={1}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Session ID')).toBeInTheDocument()
      expect(screen.getByText('Size')).toBeInTheDocument()
      expect(screen.getByText('Container')).toBeInTheDocument()
      expect(screen.getByText('Created')).toBeInTheDocument()
      expect(screen.getByText('Last Active')).toBeInTheDocument()
      expect(screen.getByText('132 x 36')).toBeInTheDocument()
      expect(screen.getByText('docker-container')).toBeInTheDocument()
      expect(screen.getByText('exec-meta')).toBeInTheDocument()
    })
  })

  it('renders empty state when no active sessions exist', async () => {
    getTerminalSessionsMock.mockResolvedValue([])

    render(
      <SessionSelector
        containerId={8}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('No active terminal sessions.')).toBeInTheDocument()
    })
  })

  it('renders error state and retries loading sessions', async () => {
    getTerminalSessionsMock
      .mockRejectedValueOnce(new Error('Failed to load'))
      .mockResolvedValueOnce([
        createSession({ id: 'exec-recovered' }),
      ])

    render(
      <SessionSelector
        containerId={7}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('exec-recovered')).toBeInTheDocument()
      expect(getTerminalSessionsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('refreshes sessions when refresh button is clicked', async () => {
    getTerminalSessionsMock
      .mockResolvedValueOnce([
        createSession({ id: 'exec-first', last_active: '2026-02-11T08:00:00Z' }),
      ])
      .mockResolvedValueOnce([
        createSession({ id: 'exec-first', last_active: '2026-02-11T08:00:00Z' }),
        createSession({ id: 'exec-second', last_active: '2026-02-11T09:00:00Z' }),
      ])

    render(
      <SessionSelector
        containerId={5}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('exec-first')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => {
      expect(screen.getByText('exec-second')).toBeInTheDocument()
      expect(getTerminalSessionsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('sorts sessions by last_active descending', async () => {
    getTerminalSessionsMock.mockResolvedValue([
      createSession({ id: 'older-session', last_active: '2026-02-10T08:00:00Z' }),
      createSession({ id: 'newer-session', last_active: '2026-02-11T08:00:00Z' }),
    ])

    render(
      <SessionSelector
        containerId={2}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('older-session')).toBeInTheDocument()
      expect(screen.getByText('newer-session')).toBeInTheDocument()
    })

    const sessionList = screen.getByTestId('session-list')
    const sessionItems = sessionList.querySelectorAll('[role="button"]')

    expect(sessionItems[0]).toHaveTextContent('newer-session')
    expect(sessionItems[1]).toHaveTextContent('older-session')
  })

  it('triggers create callback when New Session button is clicked', async () => {
    getTerminalSessionsMock.mockResolvedValue([])

    render(
      <SessionSelector
        containerId={4}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    await waitFor(() => {
      expect(getTerminalSessionsMock).toHaveBeenCalledWith(4)
    })

    fireEvent.click(screen.getByRole('button', { name: /new session/i }))
    expect(onCreateNew).toHaveBeenCalledTimes(1)
  })

  it('disables actions and skips loading when container id is invalid', () => {
    render(
      <SessionSelector
        containerId={null}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
      />
    )

    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /new session/i })).toBeDisabled()
    expect(screen.getByText('Select a container first.')).toBeInTheDocument()
    expect(getTerminalSessionsMock).not.toHaveBeenCalled()
  })
})