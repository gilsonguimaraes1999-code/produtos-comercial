import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';

const mocks = vi.hoisted(() => {
  const cities = [
    { id: 'city-nobre', name: 'Nobre', position: 0 },
    { id: 'city-santa', name: 'Santa', position: 1 },
    { id: 'city-grande', name: 'Grande', position: 2 },
  ];
  const catalog = {
    cities,
    categories: [
      { id: 'cat-nobre', cityId: 'city-nobre', title: 'Nobre produtos', icon: 'Box', position: 0 },
      { id: 'cat-santa', cityId: 'city-santa', title: 'Santa produtos', icon: 'Box', position: 0 },
      { id: 'cat-grande', cityId: 'city-grande', title: 'Grande produtos', icon: 'Box', position: 0 },
    ],
    products: [
      { id: 'product-nobre', categoryId: 'cat-nobre', name: 'Produto Nobre' },
      { id: 'product-santa', categoryId: 'cat-santa', name: 'Produto Santa' },
      { id: 'product-grande', categoryId: 'cat-grande', name: 'Produto Grande' },
    ],
    descriptionTemplates: [],
  };
  const query = {
    select: vi.fn(),
    in: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.in.mockResolvedValue({ data: cities.slice(0, 2), error: null });
  let authStateChangeHandler: ((event: string) => void) | null = null;
  return {
    catalog,
    fetchCatalogSnapshot: vi.fn().mockResolvedValue(catalog),
    client: {
      from: vi.fn().mockReturnValue(query),
      auth: {
        onAuthStateChange: vi.fn((handler: (event: string) => void) => {
          authStateChangeHandler = handler;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    },
    authRepository: { getCurrentSessionData: vi.fn().mockResolvedValue(null) },
    emitAuthStateChange(event: string) {
      authStateChangeHandler?.(event);
    },
  };
});

vi.mock('../lib/supabase/client', () => ({ getSupabaseBrowserClient: () => mocks.client }));
vi.mock('./supabase/authRepository', () => ({ getAuthRepository: () => mocks.authRepository }));
vi.mock('./supabase/catalogRepository', () => ({ getCatalogRepository: () => ({}) }));
vi.mock('./supabase/catalogSnapshot', () => ({ fetchCatalogSnapshot: mocks.fetchCatalogSnapshot }));

function ViewerHarness() {
  const { loginAsViewer, user, bootstrapCatalog } = useAuth();
  return (
    <>
      <button type="button" onClick={() => void loginAsViewer(['Nobre', 'Santa'])}>Entrar</button>
      <output data-testid="cities">{user?.allowedCityIds.join(',') || ''}</output>
      <output data-testid="products">{bootstrapCatalog?.products.map((item) => item.id).join(',') || ''}</output>
    </>
  );
}

describe('AuthProvider viewer session', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.authRepository.getCurrentSessionData.mockResolvedValue(null);
  });

  it('keeps every selected city and only their catalog data', async () => {
    render(<AuthProvider><ViewerHarness /></AuthProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByTestId('cities')).toHaveTextContent('city-nobre,city-santa');
      expect(screen.getByTestId('products')).toHaveTextContent('product-nobre,product-santa');
      expect(screen.getByTestId('products')).not.toHaveTextContent('product-grande');
    });
  });

  it('persists only the lightweight viewer session instead of the full catalog', async () => {
    render(<AuthProvider><ViewerHarness /></AuthProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByTestId('cities')).toHaveTextContent('city-nobre,city-santa'));
    const persisted = JSON.parse(localStorage.getItem('sg_showcase_session') || 'null');

    expect(persisted.user.allowedCityIds).toEqual(['city-nobre', 'city-santa']);
    expect(persisted.catalog).toBeUndefined();
  });

  it('does not discard a viewer session when Supabase emits SIGNED_OUT', async () => {
    render(<AuthProvider><ViewerHarness /></AuthProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByTestId('cities')).toHaveTextContent('city-nobre,city-santa'));

    act(() => mocks.emitAuthStateChange('SIGNED_OUT'));

    expect(screen.getByTestId('cities')).toHaveTextContent('city-nobre,city-santa');
  });

  it('does not let a delayed account-session lookup overwrite the viewer', async () => {
    let resolveSessionLookup: (value: null) => void = () => undefined;
    mocks.authRepository.getCurrentSessionData.mockReturnValueOnce(
      new Promise<null>((resolve) => {
        resolveSessionLookup = resolve;
      }),
    );
    render(<AuthProvider><ViewerHarness /></AuthProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByTestId('cities')).toHaveTextContent('city-nobre,city-santa'));

    await act(async () => resolveSessionLookup(null));

    expect(screen.getByTestId('cities')).toHaveTextContent('city-nobre,city-santa');
  });
});
