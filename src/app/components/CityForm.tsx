import { ArrowDown, ArrowUp, Building2, Pencil, Save, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import { CatalogConflictError } from '../supabase/catalogMutations';
import { getCatalogEntityRepository } from '../supabase/catalogEntityRepository';
import { continueOrderDraft, type CatalogOrderDraft } from '../orderDraft';
import type { Category, City, CityPayload, MutationResult, Product } from '../types';
import { EditConflictDialog } from './EditConflictDialog';

export function CityForm({ cities, categories, products, onSave, onDelete, onReorder, onCancel }: {
  cities: City[];
  categories: Category[];
  products: Product[];
  onSave: (city: CityPayload) => Promise<MutationResult | void>;
  onDelete: (city: City) => void;
  onReorder: (cityIds: string[], expectedOrder: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<CityPayload>({ name: '' });
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderDraft, setOrderDraft] = useState<CatalogOrderDraft | null>(null);
  const [error, setError] = useState('');
  const [conflictDraft, setConflictDraft] = useState<CityPayload | null>(null);

  const orderedCities = useMemo(() => {
    if (!orderDraft) return cities;
    const cityById = new Map(cities.map((city) => [city.id, city]));
    const ordered = orderDraft.requestedOrder.map((id) => cityById.get(id)).filter((city): city is City => Boolean(city));
    cities.forEach((city) => {
      if (!orderDraft.requestedOrder.includes(city.id)) ordered.push(city);
    });
    return ordered;
  }, [cities, orderDraft]);

  function moveCity(cityId: string, direction: -1 | 1) {
    const nextIds = orderedCities.map((city) => city.id);
    const currentIndex = nextIds.indexOf(cityId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= nextIds.length) return;
    const [movedCityId] = nextIds.splice(currentIndex, 1);
    if (!movedCityId) return;
    nextIds.splice(targetIndex, 0, movedCityId);
    const baseline = cities.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((city) => city.id);
    setOrderDraft((current) => continueOrderDraft(current, baseline, nextIds));
  }

  async function saveOrder() {
    if (!orderDraft) return;
    setSavingOrder(true);
    setError('');
    try {
      await onReorder(orderDraft.requestedOrder, orderDraft.expectedOrder);
      setOrderDraft(null);
    } catch (err) {
      setError(err instanceof CatalogConflictError ? t('orderConflictMessage') : translateAppError(err, t, 'genericActionError'));
    } finally {
      setSavingOrder(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing.name.trim()) return setError(t('typeCityName'));
    setSaving(true);
    setError('');
    try {
      const draft = { ...editing, name: editing.name.trim() };
      await onSave(draft);
      setEditing({ name: '' });
    } catch (err) {
      if (err instanceof CatalogConflictError) setConflictDraft({ ...editing, name: editing.name.trim() });
      else setError(translateAppError(err, t, 'citySaveError'));
    } finally {
      setSaving(false);
    }
  }

  async function reloadLatestCity() {
    if (!conflictDraft?.id) return;
    const latest = await getCatalogEntityRepository().fetchCity(conflictDraft.id, 'pt');
    if (!latest) throw new Error('CITY_NOT_FOUND');
    setEditing({ id: latest.id, name: latest.name, version: latest.version });
    setConflictDraft(null);
    setError('');
  }

  return (
    <div className="city-manager">
      {error && <p className="form-error normal-case">{error}</p>}
      {conflictDraft && (
        <EditConflictDialog
          entityName={conflictDraft.name}
          onReload={reloadLatestCity}
          onCopy={() => navigator.clipboard.writeText(JSON.stringify(conflictDraft, null, 2))}
          onCancel={() => setConflictDraft(null)}
        />
      )}
      <form onSubmit={submit} className="stack-form embedded-form">
        <label className="field-label">
          {editing.id ? t('editCity') : t('addCity')}
          <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder={t('cityNamePlaceholder')} maxLength={80} />
        </label>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => { setEditing({ name: '' }); onCancel(); }}>{t('cancel')}</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? t('saving') : t('saveCity')}</button>
        </div>
      </form>

      <div className="city-list">
        {orderedCities.map((city, index) => {
          const cityCategories = categories.filter((category) => category.cityId === city.id);
          const cityProducts = products.filter((product) => cityCategories.some((category) => category.id === product.categoryId));
          return (
            <article key={city.id}>
              <span className="sidebar-order-controls">
                <button type="button" className="sidebar-order-button" onClick={() => moveCity(city.id, -1)} disabled={index === 0 || savingOrder} aria-label={`Mover ${city.name} para cima`} title="Mover para cima"><ArrowUp size={11} /></button>
                <button type="button" className="sidebar-order-button" onClick={() => moveCity(city.id, 1)} disabled={index === orderedCities.length - 1 || savingOrder} aria-label={`Mover ${city.name} para baixo`} title="Mover para baixo"><ArrowDown size={11} /></button>
              </span>
              <Building2 size={20} />
              <div>
                <strong>{city.name}</strong>
                <small>{t('cityStats', { categories: cityCategories.length, products: cityProducts.length })}</small>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => setEditing({ id: city.id, name: city.name, version: city.version })} aria-label={t('editCity')} title={t('editCity')}><Pencil size={15} /></button>
                <button type="button" onClick={() => onDelete(city)} aria-label={t('deleteCity')} title={t('deleteCity')}><Trash2 size={15} /></button>
              </div>
            </article>
          );
        })}
      </div>
      {orderDraft && (
        <div className="city-order-save-bar" role="status">
          <strong>{t('pendingChanges')}</strong>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setOrderDraft(null)} disabled={savingOrder}><Undo2 size={16} /> Desfazer alterações</button>
            <button type="button" className="primary-button" onClick={() => void saveOrder()} disabled={savingOrder}><Save size={16} /> {savingOrder ? t('savingChanges') : t('saveChanges')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
