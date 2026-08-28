import type {
  AccessRequest,
  AccessRequestPayload,
  AccessRequestReceipt,
  AuthUser,
  BackupRecord,
  BackupResult,
  CatalogSnapshot,
  UserPayload,
  UserPermissions,
  UserRole,
} from './types';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { getAccessRequestsRepository } from './supabase/accessRequestsRepository';
import { getUsersRepository } from './supabase/usersRepository';
import { getBackupRepository } from './supabase/backupRepository';

export type ApiErrorCode =
  | 'API_NOT_CONFIGURED'
  | 'REQUEST_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'REQUEST_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  | 'OWNER_REQUIRED'
  | 'CATEGORY_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'INVALID_CURRENCY'
  | 'IMAGE_REQUIRED'
  | 'INVALID_IMAGE_CONTENT'
  | 'UPLOAD_FAILED'
  | 'ACCESS_NAME_REQUIRED'
  | 'ACCESS_USERNAME_REQUIRED'
  | 'ACCESS_PASSWORD_REQUIRED'
  | 'ACCESS_CITY_REQUIRED'
  | 'USERNAME_INVALID'
  | 'USERNAME_IN_USE'
  | 'ACCESS_REQUEST_PENDING'
  | 'INVALID_ACCESS_CITY';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly technicalMessage: string | undefined;

  constructor(code: ApiErrorCode, technicalMessage?: string) {
    super(technicalMessage || code);
    this.name = 'ApiError';
    this.code = code;
    this.technicalMessage = technicalMessage;
  }
}

export const accessRequestsApi = {
  async cities() {
    const result = await getSupabaseBrowserClient()
      .from('cities')
      .select('name')
      .order('position', { ascending: true });
    if (result.error) throw result.error;
    return { cities: (result.data || []).map((row) => row.name) };
  },
  async create(requestData: AccessRequestPayload) {
    const cityResult = await getSupabaseBrowserClient()
      .from('cities')
      .select('id, name')
      .in('name', requestData.requestedCityNames);
    if (cityResult.error) throw cityResult.error;
    const receipt = await getAccessRequestsRepository().create(
      requestData,
      (cityResult.data || []).map((row) => row.id),
    );
    const request: AccessRequest = {
      id: receipt.requestId,
      name: requestData.name,
      username: requestData.username,
      cityName: requestData.cityName,
      requestedCityNames: requestData.requestedCityNames,
      status: 'PENDENTE',
      approved: false,
    };
    return { request, receipt };
  },
  async status(receipt: AccessRequestReceipt) {
    return getAccessRequestsRepository().status(receipt);
  },
  async list(_token: string) {
    return { requests: await getAccessRequestsRepository().list() };
  },
  async approve(
    _token: string,
    id: string,
    _role: UserRole = 'COMERCIAL',
    _permissions?: UserPermissions,
    allowedCityIds?: string[],
  ) {
    const result = await getAccessRequestsRepository().approve(id, allowedCityIds || []);
    return { ...result, users: result.user ? [result.user] : [] };
  },
  async reject(_token: string, id: string) {
    return getAccessRequestsRepository().reject(id);
  },
};

export const usersApi = {
  async list(_token: string) {
    return { users: await getUsersRepository().list() };
  },
  async save(_token: string, user: UserPayload) {
    await getUsersRepository().save(user);
    return { users: await getUsersRepository().list() };
  },
  async remove(_token: string, id: string) {
    await getUsersRepository().remove(id);
    return { users: await getUsersRepository().list() };
  },
};

export const backupApi = {
  async create(_token: string): Promise<{ backup: BackupResult }> {
    return { backup: await getBackupRepository().create() };
  },
  async list(_token: string): Promise<{ backups: BackupRecord[] }> {
    return { backups: await getBackupRepository().list() };
  },
  async import(_token: string, backup: unknown): Promise<{ imported: boolean; catalog: CatalogSnapshot }> {
    await getBackupRepository().import(backup);
    return {
      imported: true,
      catalog: { revision: Date.now(), cities: [], categories: [], products: [] },
    };
  },
};
