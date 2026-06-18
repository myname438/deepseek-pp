import type { ToolResult } from '../tool/types';

export type MultimodalMediaKind = 'image' | 'video';

export const MULTIMODAL_MEDIA_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MULTIMODAL_MEDIA_VIDEO_INLINE_MAX_BYTES = 20 * 1024 * 1024;
export const MULTIMODAL_MEDIA_MAX_ITEMS_PER_TURN = 8;
export const MULTIMODAL_MEDIA_PREFLIGHT_PROMPT_START = '[DeepSeek++ automatic multimodal MCP analysis]';
export const MULTIMODAL_MEDIA_PREFLIGHT_PROMPT_END = '[/DeepSeek++ automatic multimodal MCP analysis]';

export interface MultimodalMediaInput {
  id: string;
  kind: MultimodalMediaKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;
  base64Data?: string;
}

export interface MultimodalMediaAnalysisSubject {
  id: string;
  kind: MultimodalMediaKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MultimodalMediaAnalyzeRequest {
  prompt: string;
  media: MultimodalMediaInput[];
  chatSessionId?: string | null;
  parentMessageId?: number | null;
}

export interface MultimodalMediaAnalysisItem {
  id: string;
  kind: MultimodalMediaKind;
  media: MultimodalMediaAnalysisSubject[];
  result: ToolResult;
}

export interface MultimodalMediaAnalyzeResponse {
  ok: boolean;
  analyses: MultimodalMediaAnalysisItem[];
  error?: string;
}

export interface MultimodalPendingRouteItem {
  id: string;
  routeKey: string;
  createdAt: number;
}

export interface MultimodalMediaRouteRequest {
  parentMessageId?: number | string | null;
}

export function assertSupportedMultimodalMedia(
  input: Pick<MultimodalMediaInput, 'kind' | 'mimeType' | 'sizeBytes' | 'name'>,
): void {
  if (input.kind === 'image') {
    if (!input.mimeType.startsWith('image/')) {
      throw new Error(`${input.name} is not an image file.`);
    }
    if (input.sizeBytes > MULTIMODAL_MEDIA_IMAGE_MAX_BYTES) {
      throw new Error(
        `${input.name} is larger than the ${formatLimit(MULTIMODAL_MEDIA_IMAGE_MAX_BYTES)} image limit.`,
      );
    }
    return;
  }

  if (!input.mimeType.startsWith('video/')) {
    throw new Error(`${input.name} is not a video file.`);
  }
  if (input.sizeBytes > MULTIMODAL_MEDIA_VIDEO_INLINE_MAX_BYTES) {
    throw new Error(
      `${input.name} is larger than the ${formatLimit(MULTIMODAL_MEDIA_VIDEO_INLINE_MAX_BYTES)} inline video limit. Use a public video URL or a future local-path picker for large videos.`,
    );
  }
}

export function buildMultimodalAnalysisPrompt(
  userPrompt: string,
  analyses: readonly MultimodalMediaAnalysisItem[],
): string {
  if (analyses.length === 0) return userPrompt;

  const mediaText = analyses.map((item, index) => {
    const text = toolResultText(item.result);
    const subjects = item.media.map((media) =>
      `- ${media.name} (${media.mimeType}, ${media.sizeBytes} bytes)`,
    ).join('\n');
    return [
      `Media analysis ${index + 1}: ${item.kind}`,
      subjects,
      text,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return [
    MULTIMODAL_MEDIA_PREFLIGHT_PROMPT_START,
    mediaText,
    MULTIMODAL_MEDIA_PREFLIGHT_PROMPT_END,
    '',
    userPrompt,
  ].join('\n');
}

export function hasDeepSeekChatSessionRoute(routeKey: string): boolean {
  const pathname = routeKey.split('?')[0] ?? routeKey;
  return /\/(?:a\/)?chat\/s\/[^/?#]+/.test(pathname);
}

export function shouldPreserveInitialMultimodalMediaRoute(
  previousRouteKey: string,
  nextRouteKey: string,
): boolean {
  return previousRouteKey !== nextRouteKey &&
    !hasDeepSeekChatSessionRoute(previousRouteKey) &&
    hasDeepSeekChatSessionRoute(nextRouteKey);
}

export function selectMultimodalMediaRouteKeyForRequest(
  pending: readonly MultimodalPendingRouteItem[],
  currentRouteKey: string,
  request: MultimodalMediaRouteRequest,
): string | null {
  if (pending.some((item) => item.routeKey === currentRouteKey)) return currentRouteKey;
  if (!isInitialMultimodalRequest(request)) return null;

  let selected: MultimodalPendingRouteItem | null = null;
  for (const item of pending) {
    if (hasDeepSeekChatSessionRoute(item.routeKey)) continue;
    if (!selected || item.createdAt > selected.createdAt) selected = item;
  }
  return selected?.routeKey ?? null;
}

function isInitialMultimodalRequest(request: MultimodalMediaRouteRequest): boolean {
  return request.parentMessageId == null;
}

function toolResultText(result: ToolResult): string {
  const outputText = extractOutputText(result.output);
  if (outputText) return outputText;
  return result.detail || result.summary;
}

function extractOutputText(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const text = (output as { text?: unknown }).text;
  return typeof text === 'string' ? text.trim() : '';
}

function formatLimit(bytes: number): string {
  return `${Math.floor(bytes / 1024 / 1024)} MB`;
}
