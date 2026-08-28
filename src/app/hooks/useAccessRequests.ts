import { useCallback, useEffect, useRef, useState } from 'react';

import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { getAccessRequestsRepository, isDefinitiveAccessRequestReviewError } from '../supabase/accessRequestsRepository';
import { subscribeToAccessRequests } from '../supabase/accessRequestsRealtime';
import type { AccessRequest } from '../types';

export function useAccessRequests() {
  const repositoryRef = useRef(getAccessRequestsRepository());
  const generationRef = useRef(0);
  const reviewKeysRef = useRef(new Map<string, string>());
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async (showLoading = false) => {
    const generation = ++generationRef.current;
    if (showLoading) setLoading(true);
    try {
      const next = await repositoryRef.current.list();
      if (generation === generationRef.current) {
        setRequests(next);
        setError(null);
      }
    } catch (nextError) {
      if (generation === generationRef.current) setError(nextError);
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    const unsubscribe = subscribeToAccessRequests(getSupabaseBrowserClient(), () => {
      void refresh(false);
    });
    return () => {
      generationRef.current += 1;
      unsubscribe();
    };
  }, [refresh]);

  const applyReviewedRequest = useCallback((request: AccessRequest) => {
    generationRef.current += 1;
    setRequests((current) => current.some((item) => item.id === request.id)
      ? current.map((item) => item.id === request.id ? { ...item, ...request } : item)
      : [request, ...current]);
  }, []);

  const approve = useCallback(async (requestId: string, cityIds: string[]) => {
    const actionId = `approved:${requestId}`;
    const reviewKey = reviewKeysRef.current.get(actionId) || crypto.randomUUID();
    reviewKeysRef.current.set(actionId, reviewKey);
    try {
      const result = await repositoryRef.current.approve(requestId, cityIds, reviewKey);
      reviewKeysRef.current.delete(actionId);
      applyReviewedRequest(result.request);
      setError(null);
      return result;
    } catch (nextError) {
      if (isDefinitiveAccessRequestReviewError(nextError)) reviewKeysRef.current.delete(actionId);
      setError(nextError);
      throw nextError;
    }
  }, [applyReviewedRequest]);

  const reject = useCallback(async (requestId: string, reason = '') => {
    const actionId = `rejected:${requestId}`;
    const reviewKey = reviewKeysRef.current.get(actionId) || crypto.randomUUID();
    reviewKeysRef.current.set(actionId, reviewKey);
    try {
      const result = await repositoryRef.current.reject(requestId, reason, reviewKey);
      reviewKeysRef.current.delete(actionId);
      applyReviewedRequest(result.request);
      setError(null);
      return result;
    } catch (nextError) {
      if (isDefinitiveAccessRequestReviewError(nextError)) reviewKeysRef.current.delete(actionId);
      setError(nextError);
      throw nextError;
    }
  }, [applyReviewedRequest]);

  return { requests, loading, error, approve, reject };
}
