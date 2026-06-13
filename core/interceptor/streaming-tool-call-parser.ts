import type { ToolCall, ToolDescriptor, ToolError } from '../types';
import {
  createToolCallFromInvocation,
  createToolInvocationCatalog,
  getToolCloseTag,
  getToolOpenTag,
  type ToolInvocationCatalog,
} from '../tool';

const STREAM_TOOL_RAW_MAX_LENGTH = 2048;
const TRUNCATION_SUFFIX = '\n...[truncated]';

export interface StreamingToolCallParserEvent {
  started: ToolCall[];
  completed: ToolCall[];
}

export interface StreamingToolCallParser {
  append(chunk: string): StreamingToolCallParserEvent;
  flush(): StreamingToolCallParserEvent;
}

export function createStreamingToolCallParser(
  descriptors: readonly ToolDescriptor[],
): StreamingToolCallParser {
  return new XmlStreamingToolCallParser(createToolInvocationCatalog(descriptors));
}

class XmlStreamingToolCallParser implements StreamingToolCallParser {
  private readonly targetByOpenTag = new Map<string, { invocationName: string; openTag: string; closeTag: string }>();
  private readonly openPrefixes: Set<string>;
  private readonly maxOpenPrefixLength: number;
  private state: 'NORMAL' | 'SUPPRESSING' = 'NORMAL';
  private pendingNormal = '';
  private pendingSuppressed = '';
  private current: {
    id: string;
    invocationName: string;
    openTag: string;
    closeTag: string;
    bodyParts: string[];
    bodyLength: number;
  } | null = null;

  constructor(private readonly catalog: ToolInvocationCatalog) {
    const openTags: string[] = [];
    for (const invocationName of catalog.invocationNames) {
      const openTag = getToolOpenTag(invocationName);
      openTags.push(openTag);
      this.targetByOpenTag.set(openTag, {
        invocationName,
        openTag,
        closeTag: getToolCloseTag(invocationName),
      });
    }
    this.openPrefixes = createPrefixSet(openTags);
    this.maxOpenPrefixLength = Math.max(0, ...openTags.map((tag) => tag.length - 1));
  }

  append(chunk: string): StreamingToolCallParserEvent {
    const event: StreamingToolCallParserEvent = { started: [], completed: [] };
    if (!chunk || this.targetByOpenTag.size === 0) return event;

    let remaining = chunk;
    while (remaining.length > 0) {
      remaining = this.state === 'SUPPRESSING'
        ? this.consumeSuppressedText(remaining, event)
        : this.consumeNormalText(remaining, event);
    }
    return event;
  }

  flush(): StreamingToolCallParserEvent {
    this.state = 'NORMAL';
    this.pendingNormal = '';
    this.pendingSuppressed = '';
    this.current = null;
    return { started: [], completed: [] };
  }

  private consumeNormalText(input: string, event: StreamingToolCallParserEvent): string {
    const text = this.pendingNormal + input;
    this.pendingNormal = '';

    const found = this.findFirstOpenTag(text);
    if (!found) {
      const tailLength = getPartialTailLength(text, this.openPrefixes, this.maxOpenPrefixLength);
      this.pendingNormal = tailLength > 0 ? text.slice(-tailLength) : '';
      return '';
    }

    const id = crypto.randomUUID();
    this.state = 'SUPPRESSING';
    this.pendingSuppressed = '';
    this.current = {
      id,
      invocationName: found.invocationName,
      openTag: found.openTag,
      closeTag: found.closeTag,
      bodyParts: [],
      bodyLength: 0,
    };
    event.started.push(createToolCallFromInvocation(
      found.invocationName,
      {},
      found.openTag,
      this.catalog,
      { id },
    ));
    return text.slice(found.index + found.openTag.length);
  }

  private consumeSuppressedText(input: string, event: StreamingToolCallParserEvent): string {
    const current = this.current;
    if (!current) {
      this.state = 'NORMAL';
      return input;
    }

    const text = this.pendingSuppressed + input;
    this.pendingSuppressed = '';
    const closeIndex = text.indexOf(current.closeTag);

    if (closeIndex === -1) {
      const prefixes = createPrefixSet([current.closeTag]);
      const tailLength = getPartialTailLength(text, prefixes, current.closeTag.length - 1);
      this.appendBody(text.slice(0, text.length - tailLength));
      this.pendingSuppressed = tailLength > 0 ? text.slice(-tailLength) : '';
      return '';
    }

    this.appendBody(text.slice(0, closeIndex));
    event.completed.push(this.createCompletedCall(current));
    this.state = 'NORMAL';
    this.pendingSuppressed = '';
    this.current = null;
    return text.slice(closeIndex + current.closeTag.length);
  }

  private appendBody(value: string): void {
    if (!value || !this.current) return;
    this.current.bodyParts.push(value);
    this.current.bodyLength += value.length;
  }

  private createCompletedCall(current: NonNullable<XmlStreamingToolCallParser['current']>): ToolCall {
    const body = current.bodyParts.join('');
    const raw = createBoundedRaw(current, body);

    try {
      const parsed = body.length === 0 ? {} : JSON.parse(body);
      if (!isToolPayload(parsed)) {
        return createToolCallFromInvocation(current.invocationName, {}, raw, this.catalog, {
          id: current.id,
          parseError: createToolParseError(
            'tool_call_payload_invalid',
            current.invocationName,
            'Tool call body must be a JSON object.',
          ),
        });
      }
      return createToolCallFromInvocation(current.invocationName, parsed, raw, this.catalog, {
        id: current.id,
      });
    } catch (error) {
      return createToolCallFromInvocation(current.invocationName, {}, raw, this.catalog, {
        id: current.id,
        parseError: createToolParseError(
          'tool_call_json_invalid',
          current.invocationName,
          [
            'Tool call body is not valid JSON.',
            'Use double quotes for strings and escape backslashes in local file paths, for example "D:\\\\project\\\\file.txt" or "D:/project/file.txt".',
            error instanceof Error ? error.message : String(error),
          ].join(' '),
        ),
      });
    }
  }

  private findFirstOpenTag(text: string): { invocationName: string; openTag: string; closeTag: string; index: number } | null {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const index = text.indexOf('<', searchFrom);
      if (index === -1) return null;

      const tagEnd = text.indexOf('>', index + 1);
      if (tagEnd === -1) return null;
      const candidate = text.slice(index, tagEnd + 1);
      const target = this.targetByOpenTag.get(candidate);
      if (target) return { ...target, index };

      searchFrom = candidate.includes('<', 1) ? index + 1 : tagEnd + 1;
    }

    return null;
  }
}

function createBoundedRaw(
  current: { openTag: string; closeTag: string },
  body: string,
): string {
  const rawLength = current.openTag.length + body.length + current.closeTag.length;
  if (rawLength <= STREAM_TOOL_RAW_MAX_LENGTH) return `${current.openTag}${body}${current.closeTag}`;
  return [
    current.openTag,
    `...[payload ${body.length} chars omitted]`,
    current.closeTag,
    TRUNCATION_SUFFIX,
  ].join('\n');
}

function createPrefixSet(tags: readonly string[]): Set<string> {
  const prefixes = new Set<string>();
  for (const tag of tags) {
    for (let length = 1; length < tag.length; length++) {
      prefixes.add(tag.slice(0, length));
    }
  }
  return prefixes;
}

function getPartialTailLength(text: string, prefixes: Set<string>, maxLength: number): number {
  const limit = Math.min(text.length, maxLength);
  for (let length = limit; length > 0; length--) {
    if (prefixes.has(text.slice(-length))) return length;
  }
  return 0;
}

function isToolPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createToolParseError(code: string, invocationName: string, message: string): ToolError {
  return {
    code,
    message,
    retryable: false,
    details: { invocationName },
  };
}
