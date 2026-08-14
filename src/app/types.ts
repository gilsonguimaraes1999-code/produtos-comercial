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
  | 'deleteProduct'
  | 'moveProduct';

export type UserPermissions = {
  product?: Partial<Record<ProductPermission, boolean>>;
  accessRequests?: {
    manageAssignedCities?: boolean;
  };
};

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

export interface SessionData {
  token: string;
  user: AuthUser;
  catalog?: CatalogSnapshot;
}

export interface Category {
  id: string;
  cityId: string;
  title: string;
  translations?: LocalizedText;
  icon: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface City {
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

export interface Product {
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

export interface DescriptionTemplate {
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

export interface CategoryPayload {
  id?: string | undefined;
  cityId: string;
  title: string;
  icon: string;
  sourceLanguage: ContentLanguage;
}

export interface ProductPayload {
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

export interface CityPayload {
  id?: string | undefined;
  name: string;
}

export interface DescriptionTemplatePayload {
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
