import { describe, expect, it, vi } from 'vitest';

import { reviewAccessRequest } from './handler';

describe('review access request handler', () => {
  it('returns the reviewed request and created pending user without a list reload', async () => {
    const dependencies = {
      loadRequest: vi.fn().mockResolvedValue({ id: 'request-1', username: 'ana', status: 'pending', review_key: null }),
      createAuthUser: vi.fn().mockResolvedValue('auth-1'),
      deleteAuthUser: vi.fn(),
      review: vi.fn().mockResolvedValue('profile-1'),
      loadReviewedRequest: vi.fn().mockResolvedValue({ id: 'request-1', status: 'approved' }),
      loadProfile: vi.fn().mockResolvedValue({ id: 'profile-1', status: 'pending_activation' }),
      issueActivation: vi.fn().mockResolvedValue({ code: 'ACTIVATION', expiresAt: '2026-08-28T12:00:00Z' }),
    };

    const response = await reviewAccessRequest({ requestId: 'request-1', decision: 'approved', cityIds: ['city-1'], reviewKey: 'review-1' }, dependencies);

    expect(response.request).toEqual({ id: 'request-1', status: 'approved' });
    expect(response.user).toEqual({ id: 'profile-1', status: 'pending_activation' });
    expect(response.activation).toEqual({ code: 'ACTIVATION', expiresAt: '2026-08-28T12:00:00Z' });
  });

  it('does not create a second auth user or rotate activation when the same review key is retried', async () => {
    const dependencies = {
      loadRequest: vi.fn().mockResolvedValue({ id: 'request-1', username: 'ana', status: 'approved', review_key: 'review-1' }),
      createAuthUser: vi.fn(),
      deleteAuthUser: vi.fn(),
      review: vi.fn().mockResolvedValue('profile-1'),
      loadReviewedRequest: vi.fn().mockResolvedValue({ id: 'request-1', status: 'approved' }),
      loadProfile: vi.fn().mockResolvedValue({ id: 'profile-1', status: 'pending_activation' }),
      issueActivation: vi.fn().mockResolvedValue({ code: 'MUST_NOT_BE_ISSUED' }),
    };

    const response = await reviewAccessRequest({ requestId: 'request-1', decision: 'approved', cityIds: ['city-1'], reviewKey: 'review-1' }, dependencies);

    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
    expect(dependencies.issueActivation).not.toHaveBeenCalled();
    expect(dependencies.review).toHaveBeenCalledWith({ requestId: 'request-1', decision: 'approved', cityIds: ['city-1'], reviewKey: 'review-1', authUserId: null, reason: '' });
    expect(response.activation).toBeNull();
  });

  it('returns only the request for rejection', async () => {
    const dependencies = {
      loadRequest: vi.fn().mockResolvedValue({ id: 'request-2', username: 'bia', status: 'pending', review_key: null }),
      createAuthUser: vi.fn(),
      deleteAuthUser: vi.fn(),
      review: vi.fn().mockResolvedValue(null),
      loadReviewedRequest: vi.fn().mockResolvedValue({ id: 'request-2', status: 'rejected', rejection_reason: 'Dados inválidos' }),
      loadProfile: vi.fn(),
      issueActivation: vi.fn(),
    };

    const response = await reviewAccessRequest({ requestId: 'request-2', decision: 'rejected', reason: 'Dados inválidos', reviewKey: 'review-2' }, dependencies);

    expect(response).toEqual({ ok: true, request: { id: 'request-2', status: 'rejected', rejection_reason: 'Dados inválidos' } });
  });
});
