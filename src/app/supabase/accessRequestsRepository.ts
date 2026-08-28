import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type {
  AccessRequest,
  AccessRequestPayload,
  AccessRequestReceipt,
  AccessRequestReviewResult,
  AccessRequestTrackingStatus,
  AuthUser,
} from "../types";

async function assertFunction(result: { data?: Record<string, unknown> | null; error?: { message?: string; context?: unknown } | null }) {
  let code = typeof result.data?.['error'] === 'string' ? result.data['error'] : '';
  if (!code && result.error?.context instanceof Response) {
    try {
      const body = await result.error.context.clone().json() as { error?: unknown };
      if (typeof body.error === 'string') code = body.error;
    } catch {
      // A resposta pode não conter JSON; nesse caso preservamos a mensagem técnica original.
    }
  }
  if (result.error || code) {
    const error = new Error(code || result.error?.message || 'ACCESS_REQUEST_FAILED');
    if (code) Object.assign(error, { code });
    throw error;
  }
}

function mapStatus(status: unknown): AccessRequest['status'] {
  return status === 'approved' ? 'APROVADO' : status === 'rejected' ? 'REPROVADO' : status === 'removed' ? 'REMOVIDO' : 'PENDENTE';
}

function mapRequest(row: Record<string, unknown>): AccessRequest {
  return {
    id: String(row['id']),
    name: String(row['display_name'] || row['name'] || ''),
    username: String(row['username'] || ''),
    cityName: String(row['primary_city_name'] || row['cityName'] || ''),
    requestedCityNames: Array.isArray(row['city_names']) ? row['city_names'].map(String) : [],
    approvedCityIds: Array.isArray(row['approved_city_ids']) ? row['approved_city_ids'].map((item) => typeof item === "object" && item !== null && "id" in item ? String((item as { id: unknown }).id) : String(item)) : [],
    status: mapStatus(row['status']),
    approved: row['status'] === 'approved' || row['status'] === 'APROVADO',
    ...(typeof row['created_at'] === 'string' ? { createdAt: row['created_at'] } : {}),
    ...(typeof row['updated_at'] === 'string' ? { updatedAt: row['updated_at'] } : {}),
    ...(typeof row['reviewed_at'] === 'string' ? { reviewedAt: row['reviewed_at'] } : {}),
    ...(typeof row['reviewed_by_name'] === 'string' ? { reviewedBy: row['reviewed_by_name'] } : {}),
  };
}

function mapUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row['id']),
    name: String(row['display_name'] || ''),
    username: String(row['username'] || ''),
    role: row['role'] === 'owner' ? 'OWNER' : 'COMERCIAL',
    status: row['status'] === 'active' ? 'Ativo' : 'Desativado',
  };
}

function createTrackingSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isDefinitiveAccessRequestReviewError(error: unknown) {
  const value = typeof error === 'object' && error !== null
    ? `${'code' in error ? String(error.code || '') : ''} ${'message' in error ? String(error.message || '') : ''}`
    : String(error || '');
  return ['REQUEST_NOT_PENDING', 'REQUEST_PERMISSION_DENIED', 'CITY_NOT_REQUESTED', 'APPROVAL_DATA_REQUIRED', 'REVIEW_DATA_REQUIRED']
    .some((code) => value.includes(code));
}

export function createAccessRequestsRepository(client: SupabaseClient) {
  const reviewKeys = new Map<string, string>();

  async function invokeReview(
    actionId: string,
    body: Record<string, unknown>,
    providedReviewKey?: string,
  ) {
    const reviewKey = providedReviewKey || reviewKeys.get(actionId) || crypto.randomUUID();
    reviewKeys.set(actionId, reviewKey);
    try {
      const result = await client.functions.invoke('review-access-request', { body: { ...body, reviewKey } });
      await assertFunction(result);
      reviewKeys.delete(actionId);
      return result;
    } catch (error) {
      if (isDefinitiveAccessRequestReviewError(error)) reviewKeys.delete(actionId);
      throw error;
    }
  }

  return {
    async list(): Promise<AccessRequest[]> {
      const result = await client.rpc("list_access_requests_for_management");
      if (result.error) throw new Error(result.error.message || "ACCESS_REQUESTS_LOAD_FAILED");
      return (result.data || []).map((row: Record<string, unknown>) => mapRequest(row));
    },

    async create(payload: AccessRequestPayload, cityIds: string[]): Promise<AccessRequestReceipt> {
      const receipt: AccessRequestReceipt = {
        requestId: '',
        trackingSecret: createTrackingSecret(),
        submissionKey: crypto.randomUUID(),
      };
      const result = await client.rpc('submit_access_request_v2', {
        request_display_name: payload.name.trim(),
        request_username: payload.username.trim(),
        requested_city_ids: cityIds,
        tracking_secret: receipt.trackingSecret,
        request_submission_key: receipt.submissionKey,
      });
      if (result.error) throw new Error(result.error.message || 'ACCESS_REQUEST_FAILED');
      receipt.requestId = String(result.data || '');
      return receipt;
    },

    async status(receipt: AccessRequestReceipt): Promise<AccessRequestTrackingStatus> {
      const result = await client.rpc('get_access_request_status', {
        target_request_id: receipt.requestId,
        tracking_secret: receipt.trackingSecret,
      });
      if (result.error) throw new Error(result.error.message || 'ACCESS_REQUEST_STATUS_FAILED');
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row) throw new Error('ACCESS_REQUEST_STATUS_NOT_FOUND');
      return {
        status: mapStatus(row.status) as AccessRequestTrackingStatus['status'],
        reviewedAt: typeof row.reviewed_at === 'string' ? row.reviewed_at : undefined,
        rejectionReason: typeof row.rejection_reason === 'string' ? row.rejection_reason : undefined,
      };
    },

    async approve(requestId: string, cityIds: string[], reviewKey?: string): Promise<AccessRequestReviewResult> {
      const result = await invokeReview(`approved:${requestId}`, { requestId, decision: 'approved', cityIds }, reviewKey);
      return {
        request: mapRequest(result.data!.request as unknown as Record<string, unknown>),
        ...(result.data?.user ? { user: mapUser(result.data.user as unknown as Record<string, unknown>) } : {}),
        ...(result.data?.activation !== undefined ? { activation: result.data.activation } : {}),
      };
    },

    async reject(requestId: string, reason = "", reviewKey?: string): Promise<AccessRequestReviewResult> {
      const result = await invokeReview(`rejected:${requestId}`, { requestId, decision: 'rejected', reason }, reviewKey);
      return {
        request: mapRequest(result.data!.request as unknown as Record<string, unknown>),
      };
    },
  };
}

export function getAccessRequestsRepository() {
  browserRepository ||= createAccessRequestsRepository(getSupabaseBrowserClient());
  return browserRepository;
}

let browserRepository: ReturnType<typeof createAccessRequestsRepository> | undefined;
