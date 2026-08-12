import type {
  AccessRequest,
  AccessRequestPayload,
  AuthUser,
  BackupRecord,
  BackupResult,
  CatalogSnapshot,
  CategoryPayload,
  CityPayload,
  CloneCategoryPayload,
  CloneProductPayload,
  DescriptionTemplatePayload,
  DraftImageInput,
  ProductPayload,
  SessionData,
  UserPayload,
  UserPermissions,
  UserRole,
} from './types';

const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycbyRRobZPHqB5OEeLsWNEYDYNKPf7Cd9CDQiVwBDVP74E07VK-kder0LlIsrJU7jq6Iv/exec';

const API_URL = String(import.meta.env['VITE_APPS_SCRIPT_API_URL'] || DEFAULT_API_URL).trim();

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  code?: string;
  data?: T;
  [key: string]: unknown;
}

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
  | 'UPLOAD_FAILED';

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

function inferApiErrorCode(message: string, explicitCode?: string): ApiErrorCode {
  const knownCodes: ApiErrorCode[] = [
    'API_NOT_CONFIGURED', 'REQUEST_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'REQUEST_FAILED',
    'INVALID_CREDENTIALS', 'SESSION_EXPIRED', 'OWNER_REQUIRED', 'CATEGORY_NOT_FOUND', 'PRODUCT_NOT_FOUND',
    'USER_NOT_FOUND', 'INVALID_CURRENCY', 'IMAGE_REQUIRED', 'INVALID_IMAGE_CONTENT', 'UPLOAD_FAILED',
  ];
  if (explicitCode && knownCodes.includes(explicitCode as ApiErrorCode)) return explicitCode as ApiErrorCode;

  const value = message.toLowerCase();
  if (/credenciais|credentials/.test(value)) return 'INVALID_CREDENTIALS';
  if (/sess[aã]o.*expir|session.*expir/.test(value)) return 'SESSION_EXPIRED';
  if (/apenas.*owner|only.*owner|cargo owner/.test(value)) return 'OWNER_REQUIRED';
  if (/categoria.*n[aã]o encontr|category.*not found/.test(value)) return 'CATEGORY_NOT_FOUND';
  if (/produto.*n[aã]o encontr|product.*not found/.test(value)) return 'PRODUCT_NOT_FOUND';
  if (/usu[aá]rio.*n[aã]o encontr|user.*not found/.test(value)) return 'USER_NOT_FOUND';
  if (/moeda.*inv[aá]lid|invalid currency/.test(value)) return 'INVALID_CURRENCY';
  if (/adicione.*imagem|add.*image/.test(value)) return 'IMAGE_REQUIRED';
  if (/imagem.*conte[uú]do v[aá]lido|image.*valid content/.test(value)) return 'INVALID_IMAGE_CONTENT';
  if (/imgbb|enviar imagem|upload.*image/.test(value)) return 'UPLOAD_FAILED';
  return 'REQUEST_FAILED';
}

export function isTransientApiError(error: unknown) {
  return error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT');
}

export function isApiConfigured() {
  return Boolean(API_URL && !API_URL.includes('SEU_DEPLOYMENT_ID'));
}

const REQUEST_TIMEOUT_MS = 70000;
const LOGIN_TIMEOUT_MS = 20000;

async function request<T>(
  action: string,
  payload: Record<string, unknown> = {},
  token?: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  if (!isApiConfigured()) {
    throw new ApiError('API_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, token, ...payload }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('REQUEST_TIMEOUT');
    }
    throw new ApiError('NETWORK_ERROR', error instanceof Error ? error.message : undefined);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let result: ApiEnvelope<T>;

  try {
    result = JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new ApiError('INVALID_RESPONSE', text);
  }

  if (!result.success) {
    const message = String(result.message || '');
    throw new ApiError(inferApiErrorCode(message, result.code), message);
  }

  return (result.data ?? result) as T;
}

export const authApi = {
  login(username: string, password: string) {
    return request<SessionData>('login', { username, password }, undefined, LOGIN_TIMEOUT_MS);
  },
  validate(token: string) {
    return request<{ user: AuthUser }>('validateSession', {}, token);
  },
  logout(token: string) {
    return request<{ loggedOut: boolean }>('logout', {}, token);
  },
};

export const accessRequestsApi = {
  cities() {
    return request<{ cities: string[] }>('listAccessCities', {}, undefined, LOGIN_TIMEOUT_MS);
  },
  create(requestData: AccessRequestPayload) {
    return request<{ request: AccessRequest }>('requestAccess', { request: requestData }, undefined, LOGIN_TIMEOUT_MS);
  },
  list(token: string) {
    return request<{ requests: AccessRequest[] }>('listAccessRequests', {}, token);
  },
  approve(token: string, id: string, role: UserRole = 'COMERCIAL', permissions?: UserPermissions) {
    return request<{ users: AuthUser[]; requests: AccessRequest[] }>(
      'approveAccessRequest',
      { id, role, permissions },
      token,
    );
  },
  reject(token: string, id: string) {
    return request<{ requests: AccessRequest[] }>('rejectAccessRequest', { id }, token);
  },
};

export const catalogApi = {
  uploadImage(token: string, image: DraftImageInput, productName: string) {
    return request<{ image: { url: string; deleteUrl?: string } }>('uploadImage', { image, productName }, token);
  },
  sync(token: string, sinceRevision: number, language: 'pt' | 'en' | 'es') {
    return request<{ changed: boolean; catalog?: CatalogSnapshot; revision: number }>(
      'sync',
      { sinceRevision, language },
      token,
    );
  },
  saveCategory(token: string, category: CategoryPayload) {
    return request<{ catalog: CatalogSnapshot }>('saveCategory', { category }, token);
  },
  saveCity(token: string, city: CityPayload) {
    return request<{ catalog: CatalogSnapshot }>('saveCity', { city }, token);
  },
  deleteCity(token: string, id: string) {
    return request<{ catalog: CatalogSnapshot }>('deleteCity', { id }, token);
  },
  deleteCategory(token: string, id: string) {
    return request<{ catalog: CatalogSnapshot }>('deleteCategory', { id }, token);
  },
  reorderCategories(token: string, categoryIds: string[]) {
    return request<{ catalog: CatalogSnapshot }>('reorderCategories', { categoryIds }, token);
  },
  saveProduct(token: string, product: ProductPayload) {
    return request<{ catalog: CatalogSnapshot }>('saveProduct', { product }, token);
  },
  translateProductLanguage(token: string, productId: string, language: 'pt' | 'en' | 'es') {
    return request<{ productId: string; language: 'pt' | 'en' | 'es'; catalog: CatalogSnapshot }>(
      'translateProductLanguage',
      { productId, language },
      token,
    );
  },
  cloneProduct(token: string, payload: CloneProductPayload) {
    return request<{ catalog: CatalogSnapshot }>('cloneProduct', { ...payload }, token);
  },
  cloneCategory(token: string, payload: CloneCategoryPayload) {
    return request<{ catalog: CatalogSnapshot }>('cloneCategory', { ...payload }, token);
  },
  deleteProduct(token: string, id: string) {
    return request<{ catalog: CatalogSnapshot }>('deleteProduct', { id }, token);
  },
  reorderProducts(token: string, orders: Array<{ categoryId: string; productIds: string[] }>) {
    return request<{ catalog: CatalogSnapshot }>('reorderProducts', { orders }, token);
  },
  saveDescriptionTemplate(token: string, template: DescriptionTemplatePayload) {
    return request<{ catalog: CatalogSnapshot }>('saveDescriptionTemplate', { template }, token);
  },
  deleteDescriptionTemplate(token: string, id: string) {
    return request<{ catalog: CatalogSnapshot }>('deleteDescriptionTemplate', { id }, token);
  },
};

export const usersApi = {
  list(token: string) {
    return request<{ users: AuthUser[] }>('listUsers', {}, token);
  },
  save(token: string, user: UserPayload) {
    return request<{ users: AuthUser[] }>('saveUser', { user }, token);
  },
  remove(token: string, id: string) {
    return request<{ users: AuthUser[] }>('deleteUser', { id }, token);
  },
};

export const backupApi = {
  create(token: string) {
    return request<{ backup: BackupResult }>('createBackup', {}, token);
  },
  list(token: string) {
    return request<{ backups: BackupRecord[] }>('listBackups', {}, token);
  },
  import(token: string, backup: unknown) {
    return request<{ imported: boolean; catalog: CatalogSnapshot }>('importBackup', { backup }, token);
  },
};
