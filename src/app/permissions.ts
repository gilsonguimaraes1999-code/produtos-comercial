import type { AuthUser, ProductPermission, UserPermissions } from './types';

export const PRODUCT_PERMISSIONS: ProductPermission[] = [
  'createProduct',
  'editProductCategory',
  'editProductName',
  'editProductPrice',
  'editProductDescription',
  'editProductMedia',
  'markProductSold',
  'viewSoldDiscordId',
  'cloneProduct',
  'deleteProduct',
  'moveProduct',
];

export function hasProductPermission(user: AuthUser | null | undefined, permission: ProductPermission) {
  if (!user) return false;
  if (user.role === 'OWNER') return true;
  return user.permissions?.product?.[permission] === true;
}

export function hasAnyProductPermission(user: AuthUser | null | undefined) {
  return PRODUCT_PERMISSIONS.some((permission) => hasProductPermission(user, permission));
}

export function canManageAccessRequests(user: AuthUser | null | undefined) {
  if (!user) return false;
  if (user.role === 'OWNER') return true;
  return user.permissions?.accessRequests?.manageAssignedCities === true;
}

export function normalizeUserPermissions(permissions: UserPermissions | undefined): UserPermissions {
  return {
    product: Object.fromEntries(
      PRODUCT_PERMISSIONS.map((permission) => [permission, permissions?.product?.[permission] === true]),
    ) as Record<ProductPermission, boolean>,
    accessRequests: {
      manageAssignedCities: permissions?.accessRequests?.manageAssignedCities === true,
    },
  };
}
