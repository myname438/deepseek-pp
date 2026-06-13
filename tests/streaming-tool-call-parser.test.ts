import { describe, expect, it } from 'vitest';
import { createStreamingToolCallParser } from '../core/interceptor/streaming-tool-call-parser';
import { createArtifactToolDescriptors } from '../core/artifact';

describe('createStreamingToolCallParser', () => {
  const descriptors = createArtifactToolDescriptors('en');

  it('emits a start event before a large artifact body completes', () => {
    const parser = createStreamingToolCallParser(descriptors);

    const start = parser.append('Intro <artifact_create>');
    expect(start.started).toHaveLength(1);
    expect(start.started[0]).toMatchObject({
      name: 'artifact_create',
      payload: {},
      raw: '<artifact_create>',
    });
    expect(start.completed).toHaveLength(0);

    const body = parser.append('{"filename":"demo.html","content":"');
    expect(body.started).toHaveLength(0);
    expect(body.completed).toHaveLength(0);
  });

  it('parses a completed artifact without carrying the huge raw block', () => {
    const parser = createStreamingToolCallParser(descriptors);
    const largeHtml = '<!doctype html>' + 'x'.repeat(20_000);

    parser.append('<artifact_create>');
    parser.append(JSON.stringify({
      filename: 'demo.html',
      content: largeHtml,
    }).slice(0, 12_000));
    const result = parser.append(`${JSON.stringify({
      filename: 'demo.html',
      content: largeHtml,
    }).slice(12_000)}</artifact_create>`);

    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].payload).toMatchObject({
      filename: 'demo.html',
      content: largeHtml,
    });
    expect(result.completed[0].raw.length).toBeLessThan(2200);
    expect(result.completed[0].raw).toContain('payload');
  });

  it('handles literal less-than text before a tool tag', () => {
    const parser = createStreamingToolCallParser(descriptors);

    const result = parser.append('A < draft <artifact_create>{"filename":"a.txt","content":"ok"}</artifact_create>');

    expect(result.started).toHaveLength(1);
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].payload).toMatchObject({ filename: 'a.txt', content: 'ok' });
  });
});
