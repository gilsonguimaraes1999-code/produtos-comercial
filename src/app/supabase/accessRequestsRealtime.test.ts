import { afterEach, describe, expect, it, vi } from 'vitest';

import { subscribeToAccessRequests } from './accessRequestsRealtime';

describe('access request realtime subscription', () => {
  afterEach(() => vi.useRealTimers());

  it('groups request and city events into one refresh and removes the channel', () => {
    vi.useFakeTimers();
    const handlers: Array<() => void> = [];
    const channel = {
      on: vi.fn((_event, _filter, handler: () => void) => {
        handlers.push(handler);
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    };
    const onChange = vi.fn();

    const unsubscribe = subscribeToAccessRequests(client as never, onChange, 100);
    handlers[0]?.();
    handlers[1]?.();
    vi.advanceTimersByTime(99);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('cancels a pending notification when unsubscribed', () => {
    vi.useFakeTimers();
    let handler: (() => void) | undefined;
    const channel = {
      on: vi.fn((_event, _filter, next: () => void) => {
        handler = next;
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const onChange = vi.fn();

    const unsubscribe = subscribeToAccessRequests(client as never, onChange, 100);
    handler?.();
    unsubscribe();
    vi.runAllTimers();

    expect(onChange).not.toHaveBeenCalled();
  });
});
