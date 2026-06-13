import { describe, expect, it } from 'vitest';
import { createStreamingToolTextAccumulator } from '../core/interceptor/streaming-tool-text';
import { createMemoryToolDescriptors } from '../core/tool';

describe('createStreamingToolTextAccumulator', () => {
  const descriptors = createMemoryToolDescriptors('en');

  it('passes ordinary text through incrementally', () => {
    const stream = createStreamingToolTextAccumulator(descriptors);

    expect(stream.append('hello ')).toBe('hello ');
    expect(stream.append('world')).toBe('hello world');
    expect(stream.flush()).toBe('hello world');
  });

  it('suppresses completed tool calls across chunk boundaries', () => {
    const stream = createStreamingToolTextAccumulator(descriptors);

    expect(stream.append('Before <memory_')).toBe('Before ');
    expect(stream.append('save>{"name":"n","content":"c"}</memory_')).toBe('Before ');
    expect(stream.append('save> after')).toBe('Before  after');
    expect(stream.flush()).toBe('Before  after');
  });

  it('releases false-positive partial open tags on flush', () => {
    const stream = createStreamingToolTextAccumulator(descriptors);

    expect(stream.append('literal <memory_')).toBe('literal ');
    expect(stream.flush()).toBe('literal <memory_');
  });

  it('keeps tail text after a same-chunk tool call', () => {
    const stream = createStreamingToolTextAccumulator(descriptors);

    const text = [
      'A',
      '<memory_save>{"name":"n","content":"c"}</memory_save>',
      'B',
    ].join('');

    expect(stream.append(text)).toBe('AB');
  });

  it('detects tool calls after literal less-than text', () => {
    const stream = createStreamingToolTextAccumulator(descriptors);

    const text = [
      'A < draft ',
      '<memory_save>{"name":"n","content":"c"}</memory_save>',
      'B',
    ].join('');

    expect(stream.append(text)).toBe('A < draft B');
  });

  it('suppresses legacy DSML tool-call blocks across chunk boundaries', () => {
    const stream = createStreamingToolTextAccumulator(descriptors);

    expect(stream.append('Before <｜DSML｜tool_')).toBe('Before ');
    expect(stream.append('calls><｜DSML｜invoke name="memory_save">')).toBe('Before ');
    expect(stream.append('<｜DSML｜parameter name="name" string="true">n</｜DSML｜parameter>')).toBe('Before ');
    expect(stream.append('</｜DSML｜invoke></｜DSML｜tool_')).toBe('Before ');
    expect(stream.append('calls> after')).toBe('Before  after');
    expect(stream.flush()).toBe('Before  after');
  });

  it('releases false-positive partial legacy tags on flush', () => {
    const stream = createStreamingToolTextAccumulator(descriptors);

    expect(stream.append('literal <｜DSML｜tool_')).toBe('literal ');
    expect(stream.flush()).toBe('literal <｜DSML｜tool_');
  });
});
