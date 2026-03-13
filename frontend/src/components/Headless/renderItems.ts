import type { MessageContent, StreamEvent, TurnInfo } from '@/types/headless';

export interface AssistantRenderItem {
  content: MessageContent;
  key: string;
}

function cloneContent(content: MessageContent): MessageContent {
  return {
    ...content,
    input: content.input ? { ...content.input } : undefined,
  };
}

function collectAssistantContentsFromStreamEvents(events: StreamEvent[] = []): MessageContent[] {
  const contents: MessageContent[] = [];

  for (const event of events) {
    if (event.type !== 'assistant' || !event.message?.content) {
      continue;
    }

    for (const content of event.message.content) {
      if (
        content.type === 'text'
        || content.type === 'thinking'
        || content.type === 'tool_use'
        || content.type === 'tool_result'
      ) {
        contents.push(cloneContent(content));
      }
    }
  }

  return contents;
}

function collectAssistantContentsFromEventInfos(events: TurnInfo['events'] = []): MessageContent[] {
  const contents: MessageContent[] = [];

  for (const event of events) {
    try {
      const parsed = JSON.parse(event.raw_json) as StreamEvent;
      contents.push(...collectAssistantContentsFromStreamEvents([parsed]));
    } catch {
      // 历史事件可能含有非 JSON 行，忽略即可。
    }
  }

  return contents;
}

function hasEquivalentTextContent(text: string, contents: MessageContent[]): boolean {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return true;
  }

  return contents.some(content => content.type === 'text' && content.text?.trim() === normalizedText);
}

function getRenderItemKey(content: MessageContent, index: number): string {
  switch (content.type) {
    case 'text':
      return `text-${index}-${content.text ?? ''}`;
    case 'thinking':
      return `thinking-${index}-${content.thinking ?? ''}`;
    case 'tool_use':
      return `tool-${content.id ?? index}`;
    case 'tool_result':
      return `tool-result-${content.tool_use_id ?? index}`;
    default:
      return `item-${index}`;
  }
}

export function isToolRenderItem(item: AssistantRenderItem): boolean {
  return item.content.type === 'tool_use' || item.content.type === 'tool_result';
}

export function buildAssistantRenderItems(turn: TurnInfo, liveEvents: StreamEvent[] = []): AssistantRenderItem[] {
  const liveContents = collectAssistantContentsFromStreamEvents(liveEvents);
  const structuredContents = Array.isArray(turn.assistant_response)
    ? turn.assistant_response.map(cloneContent)
    : [];
  const historicalContents = collectAssistantContentsFromEventInfos(turn.events);
  const assistantText = typeof turn.assistant_response === 'string'
    ? turn.assistant_response.trim()
    : '';

  let contents = liveContents;
  if (contents.length === 0) {
    contents = structuredContents.length > 0 ? structuredContents : historicalContents;
  }

  if (assistantText && !hasEquivalentTextContent(assistantText, contents) && !contents.some(content => content.type === 'text')) {
    contents = [{ type: 'text', text: assistantText }, ...contents];
  }

  return contents.map((content, index) => ({
    content,
    key: getRenderItemKey(content, index),
  }));
}
