import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = {
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
};
let realtimeCallback: (() => void) | undefined;
const unsubscribe = vi.fn();

vi.mock('../supabase/accessRequestsRepository', () => ({
  getAccessRequestsRepository: () => repository,
  isDefinitiveAccessRequestReviewError: (error: unknown) => error instanceof Error && error.message.includes('REQUEST_NOT_PENDING'),
}));
vi.mock('../supabase/accessRequestsRealtime', () => ({
  subscribeToAccessRequests: vi.fn((_client, callback: () => void) => {
    realtimeCallback = callback;
    return unsubscribe;
  }),
}));
vi.mock('../../lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ channel: vi.fn() }),
}));

import { useAccessRequests } from './useAccessRequests';

describe('useAccessRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallback = undefined;
    repository.list.mockResolvedValue([{ id: 'request-1', status: 'PENDENTE', approved: false }]);
  });

  it('refreshes from realtime and never starts a four-second interval', async () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');
    const { result, unmount } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => realtimeCallback?.());

    expect(repository.list).toHaveBeenCalledTimes(2);
    expect(intervalSpy.mock.calls.some((call) => call[1] === 4000)).toBe(false);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('applies the reviewed request locally without listing again', async () => {
    repository.approve.mockResolvedValue({
      request: { id: 'request-1', name: 'Ana', username: 'ana', cityName: 'Nobre', status: 'APROVADO', approved: true },
      user: { id: 'user-1' },
    });
    const { result } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.approve('request-1', ['city-1']));

    expect(result.current.requests[0]?.status).toBe('APROVADO');
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it('reuses one review key when an uncertain approval is retried', async () => {
    repository.approve
      .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
      .mockResolvedValueOnce({ request: { id: 'request-1', status: 'APROVADO', approved: true } });
    const { result } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.approve('request-1', ['city-1'])).rejects.toThrow('NETWORK_ERROR');
    });
    await act(async () => {
      await result.current.approve('request-1', ['city-1']);
    });

    const firstKey = repository.approve.mock.calls[0]?.[2];
    const retryKey = repository.approve.mock.calls[1]?.[2];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retryKey).toBe(firstKey);
  });

  it('discards the review key after a definitive conflict', async () => {
    repository.reject
      .mockRejectedValueOnce(new Error('REQUEST_NOT_PENDING'))
      .mockResolvedValueOnce({ request: { id: 'request-1', status: 'REPROVADO', approved: false } });
    const { result } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.reject('request-1')).rejects.toThrow('REQUEST_NOT_PENDING');
    });
    await act(async () => {
      await result.current.reject('request-1');
    });

    expect(repository.reject.mock.calls[1]?.[2]).not.toBe(repository.reject.mock.calls[0]?.[2]);
  });
});
