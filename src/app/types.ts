export type UserRole = 'OWNER' | 'COMERCIAL';
export type AccessRequestStatus = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'REMOVIDO';
export type CurrencyCode = 'BRL' | 'USD' | 'GBP' | 'EUR';
export type ContentLanguage = 'pt' | 'en' | 'es';
export type LocalizedText = Partial<Record<ContentLanguage, string>>;
export type ProductPrices = Partial<Record<CurrencyCode, number>>;
export type MediaType = 'image' | 'video';
export type VideoProvider = 'youtube' | 'drive' | 'direct';
export type ProductPermission =
  | 'createProduct'
  | 'editProductCategory'
  | 'editProductName'
  | 'editProductPrice'
  | 'editProductDescription'
  | 'editProductMedia'
  | 'markProductSold'
  | 'viewSoldDiscordId'
  | 'cloneProduct'
  | 'cloneCategory'
  | 'deleteProduct'
  | 'moveProduct';

export type UserPermissions = {
  product?: Partial<Record<ProductPermission, boolean>>;
  accessRequests?: {
    manageAssignedCities?: boolean;
  };
};

export interface VersionedEntity {
  version?: number | undefined;
}

export interface MutationResult {
  id: string;
  version: number;
}

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  permissions?: UserPermissions | undefined;
  allowedCityIds?: string[] | undefined;
  status: 'Ativo' | 'Desativado';
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessRequest {
  id: string;
  name: string;
  username: string;
  cityName: string;
  requestedCityNames?: string[] | undefined;
  approvedCityIds?: string[] | undefined;
  status: AccessRequestStatus;
  approved: boolean;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface AccessRequestPayload {
  name: string;
  username: string;
  password: string;
  cityName: string;
  requestedCityNames: string[];
}

export interface AccessRequestReceipt {
  requestId: string;
  trackingSecret: string;
  submissionKey: string;
}

export interface AccessRequestTrackingStatus {
  status: Exclude<AccessRequestStatus, 'REMOVIDO'>;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface AccessRequestReviewResult {
  request: AccessRequest;
  user?: AuthUser;
}

export interface SessionData {
  token: string;
  user: AuthUser;
  catalog?: CatalogSnapshot;
}

export interface Category extends VersionedEntity {
  id: string;
  cityId: string;
  title: string;
  translations?: LocalizedText;
  icon: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface City extends VersionedEntity {
  id: string;
  name: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  deleteUrl?: string | undefined;
  order: number;
  mediaType?: MediaType | undefined;
  videoProvider?: VideoProvider | undefined;
  thumbnailUrl?: string | undefined;
}

export interface Product extends VersionedEntity {
  id: string;
  categoryId: string;
  coordinates?: string;
  storageWeight?: string;
  importKey?: string;
  name: string;
  translations?: LocalizedText;
  descriptionHtml?: string;
  descriptionTranslations?: LocalizedText;
  sold?: boolean;
  soldOwnerName?: string;
  soldOwnerDiscordId?: string;
  amount: number | null;
  currency: CurrencyCode;
  prices?: ProductPrices;
  order: number;
  images: ProductImage[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DescriptionTemplate extends VersionedEntity {
  id: string;
  categoryId: string;
  title: string;
  order: number;
  active: boolean;
  htmlBR: string;
  htmlEN: string;
  htmlES: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogSnapshot {
  revision: number;
  cities: City[];
  categories: Category[];
  products: Product[];
  descriptionTemplates?: DescriptionTemplate[];
}

export interface CatalogPage {
  products: Product[];
  nextCursor: { position: number; id: string } | null;
}

export interface BackupResult {
  id: string;
  createdAt: string;
  categoriesCount: number;
  productsCount: number;
  usersCount: number;
  fileName?: string | undefined;
  snapshot?: unknown;
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  fileName?: string | undefined;
  snapshot?: unknown;
}

export interface DraftImageInput {
  id?: string | undefined;
  url?: string;
  sourceType?: 'url' | 'base64';
  source?: string;
  name?: string | undefined;
  mediaType?: MediaType | undefined;
  videoProvider?: VideoProvider | undefined;
  thumbnailUrl?: string | undefined;
}

export interface CategoryPayload extends VersionedEntity {
  id?: string | undefined;
  cityId: string;
  title: string;
  icon: string;
  sourceLanguage: ContentLanguage;
}

export interface ProductPayload extends VersionedEntity {
  id?: string | undefined;
  categoryId: string;
  coordinates?: string;
  storageWeight?: string;
  name: string;
  descriptionHtml?: string;
  descriptionTranslations?: LocalizedText;
  sourceLanguage: ContentLanguage;
  autoTranslate?: boolean;
  autoTranslateDescription?: boolean;
  syncNameAcrossLanguages?: boolean;
  sold?: boolean;
  soldOwnerName?: string;
  soldOwnerDiscordId?: string;
  order?: number;
  prices: ProductPrices;
  amount?: number | null;
  currency: CurrencyCode;
  images: DraftImageInput[];
}

export interface CityPayload extends VersionedEntity {
  id?: string | undefined;
  name: string;
}

export interface DescriptionTemplatePayload extends VersionedEntity {
  id?: string | undefined;
  categoryId: string;
  title: string;
  order?: number | undefined;
  active: boolean;
  htmlBR: string;
  htmlEN: string;
  htmlES: string;
}

export interface CloneProductPayload {
  productId: string;
  targetCategoryId: string;
}

export interface CloneCategoryPayload {
  categoryId: string;
  targetCityId: string;
}

export interface UserPayload {
  id?: string | undefined;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  permissions?: UserPermissions | undefined;
  allowedCityIds: string[];
  active: boolean;
}
