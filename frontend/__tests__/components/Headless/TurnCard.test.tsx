import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TurnCard } from '@/components/Headless/TurnCard'
import type { EventInfo, MessageContent, StreamEvent, TurnInfo } from '@/types/headless'

function createTurn(overrides: Partial<TurnInfo> = {}): TurnInfo {
  return {
    id: 1,
    turn_index: 1,
    user_prompt: '请帮我查一下天气',
    prompt_source: 'user',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
    state: 'running',
    created_at: '2026-03-13T00:00:00.000Z',
    ...overrides,
  }
}

function createAssistantEvent(content: MessageContent[]): StreamEvent {
  return {
    type: 'assistant',
    message: {
      content,
    },
  }
}

function createHistoryEvents(events: StreamEvent[]): EventInfo[] {
  return events.map((event, index) => ({
    id: index + 1,
    event_index: index,
    event_type: event.type,
    raw_json: JSON.stringify(event),
    created_at: `2026-03-13T00:00:0${index}.000Z`,
  }))
}

describe('TurnCard', () => {
  it('按 text-tool-text 的真实顺序内联渲染内容', () => {
    const liveEvents = [
      createAssistantEvent([
        { type: 'text', text: '第一段文本' },
        { type: 'tool_use', id: 'tool-1', name: 'Search Docs', input: { query: 'headless tools' } },
        { type: 'text', text: '第二段文本' },
      ]),
    ]

    render(
      <TurnCard
        turn={createTurn()}
        events={liveEvents}
        isLive
      />,
    )

    const assistantResponse = screen.getByTestId('assistant-response')
    const textContent = assistantResponse.textContent ?? ''

    expect(textContent.indexOf('第一段文本')).toBeGreaterThanOrEqual(0)
    expect(textContent.indexOf('Search Docs')).toBeGreaterThan(textContent.indexOf('第一段文本'))
    expect(textContent.indexOf('第二段文本')).toBeGreaterThan(textContent.indexOf('Search Docs'))
    expect(screen.getByRole('button', { name: 'Tool Search Docs' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('completed 后自动折叠工具卡片，但保留原位置', () => {
    const assistantContent: MessageContent[] = [
      { type: 'text', text: '先说明一下。' },
      { type: 'tool_use', id: 'tool-2', name: 'Search Docs', input: { query: 'collapse after complete' } },
      { type: 'text', text: '最后总结。' },
    ]
    const liveEvents = [createAssistantEvent(assistantContent)]
    const { rerender } = render(
      <TurnCard
        turn={createTurn()}
        events={liveEvents}
        isLive
      />,
    )

    expect(screen.getByRole('button', { name: 'Tool Search Docs' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('tool-use-body')).toBeInTheDocument()

    rerender(
      <TurnCard
        turn={createTurn({
          state: 'completed',
          assistant_response: assistantContent,
        })}
        isLive={false}
      />,
    )

    const assistantResponse = screen.getByTestId('assistant-response')
    const textContent = assistantResponse.textContent ?? ''

    expect(screen.getByRole('button', { name: 'Tool Search Docs' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('tool-use-body')).not.toBeInTheDocument()
    expect(textContent.indexOf('先说明一下。')).toBeGreaterThanOrEqual(0)
    expect(textContent.indexOf('Search Docs')).toBeGreaterThan(textContent.indexOf('先说明一下。'))
    expect(textContent.indexOf('最后总结。')).toBeGreaterThan(textContent.indexOf('Search Docs'))
  })

  it('cancel 或 error 后自动折叠工具结果卡片', () => {
    const assistantContent: MessageContent[] = [
      { type: 'tool_result', tool_use_id: 'tool-3', content: { status: 'running', detail: 'cancel-marker' }, is_error: true },
    ]
    const liveEvents = [createAssistantEvent(assistantContent)]
    const { rerender } = render(
      <TurnCard
        turn={createTurn()}
        events={liveEvents}
        isLive
      />,
    )

    expect(screen.getByRole('button', { name: 'Tool result tool-3' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('tool-result-body')).toBeInTheDocument()

    rerender(
      <TurnCard
        turn={createTurn({
          state: 'error',
          assistant_response: assistantContent,
          error_message: 'Execution cancelled by user',
        })}
        isLive={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Tool result tool-3' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('tool-result-body')).not.toBeInTheDocument()
    expect(screen.getByText('Execution cancelled by user')).toBeInTheDocument()
  })

  it('历史 turn 仅依赖 events 也能显示工具调用', () => {
    const historicalEvents = createHistoryEvents([
      createAssistantEvent([
        { type: 'text', text: '历史文本前缀' },
        { type: 'tool_use', id: 'tool-4', name: 'History Search', input: { query: 'history replay' } },
        { type: 'tool_result', tool_use_id: 'tool-4', content: { ok: true } },
      ]),
    ])

    render(
      <TurnCard
        turn={createTurn({
          state: 'completed',
          assistant_response: undefined,
          events: historicalEvents,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Tool History Search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tool result tool-4' })).toBeInTheDocument()
    expect(screen.getByTestId('assistant-response')).toHaveTextContent('历史文本前缀')
  })
})
