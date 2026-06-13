import type { ToolDescriptor } from '../types';
import { createToolInvocationCatalog, getToolCloseTag } from '../tool';

export interface ToolCallScanGate {
  shouldScanChunk(text: string): boolean;
}

export function createToolCallScanGate(
  descriptors: readonly ToolDescriptor[],
): ToolCallScanGate {
  const catalog = createToolInvocationCatalog(descriptors);
  const closeTags = catalog.invocationNames.map(getToolCloseTag);
  const closeTagSet = new Set(closeTags);
  const tailSize = Math.max(0, ...closeTags.map((tag) => tag.length - 1));
  let tail = '';

  return {
    shouldScanChunk(text: string): boolean {
      if (!text || closeTags.length === 0) return false;
      const probe = tail + text;
      tail = tailSize > 0 ? probe.slice(-tailSize) : '';
      return containsKnownCloseTag(probe, closeTagSet);
    },
  };
}

function containsKnownCloseTag(text: string, closeTags: ReadonlySet<string>): boolean {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const index = text.indexOf('</', searchFrom);
    if (index === -1) return false;

    const tagEnd = text.indexOf('>', index + 2);
    if (tagEnd === -1) return false;
    const candidate = text.slice(index, tagEnd + 1);
    if (closeTags.has(candidate)) return true;

    searchFrom = candidate.includes('</', 2) ? index + 2 : tagEnd + 1;
  }

  return false;
}
