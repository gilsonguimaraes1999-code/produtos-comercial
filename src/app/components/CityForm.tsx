import { Building2, Pencil, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import type { Category, City, CityPayload, Product } from '../types';

export function CityForm({ cities, categories, products, onSave, onDelete, onCancel }: {
  cities: City[];
  categories: Category[];
  products: Product[];
  onSave: (city: CityPayload) => Promise<void>;
  onDelete: (city: City) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<CityPayload>({ name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing.name.trim()) return setError(t('typeCityName'));
    setSaving(true);
    setError('');
    try {
      await onSave({ id: editing.id, name: editing.name.trim() });
      setEditing({ name: '' });
    } catch (err) {
      setError(translateAppError(err, t, 'citySaveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="city-manager">
      {error && <p className="form-error normal-case">{error}</p>}
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
        {cities.map((city) => {
          const cityCategories = categories.filter((category) => category.cityId === city.id);
          const cityProducts = products.filter((product) => cityCategories.some((category) => category.id === product.categoryId));
          return (
            <article key={city.id}>
              <Building2 size={20} />
              <div>
                <strong>{city.name}</strong>
                <small>{t('cityStats', { categories: cityCategories.length, products: cityProducts.length })}</small>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => setEditing({ id: city.id, name: city.name })} aria-label={t('editCity')} title={t('editCity')}><Pencil size={15} /></button>
                <button type="button" onClick={() => onDelete(city)} aria-label={t('deleteCity')} title={t('deleteCity')}><Trash2 size={15} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
