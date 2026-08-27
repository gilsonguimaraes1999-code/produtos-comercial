import { useMemo, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { translateAppError, translateIconName, useTranslation } from '../../i18n';
import { GLOBAL_ICONS, CatalogIcon } from '../icons';
import { contentLanguageFor, localizedCategoryTitle } from '../localization';
import type { Category, CategoryPayload } from '../types';
import type { City } from '../types';
import { CitySelect } from './CitySelect';

export function CategoryForm({ category, cities, defaultCityId, onSave, onCancel }: {
  category?: Category | undefined;
  cities: City[];
  defaultCityId?: string | undefined;
  onSave: (data: CategoryPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const { language, t } = useTranslation();
  const [cityId, setCityId] = useState(category?.cityId || defaultCityId || cities[0]?.id || '');
  const [title, setTitle] = useState(category ? localizedCategoryTitle(category, language) : '');
  const [icon, setIcon] = useState(category?.icon || 'Package');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const icons = useMemo(() => {
    const search = query.trim().toLowerCase();
    return Object.keys(GLOBAL_ICONS).filter((name) =>
      !search || name.toLowerCase().includes(search) || translateIconName(language, name).toLowerCase().includes(search),
    );
  }, [language, query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t('typeCategoryTitle'));
      return;
    }
    if (!cityId) {
      setError(t('selectCity'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ id: category?.id, cityId, title: title.trim(), icon, sourceLanguage: contentLanguageFor(language) });
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'categorySaveError'));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack-form">
      {error && <p className="form-error normal-case">{error}</p>}
      <div className="field-label">
        {t('city')}
        <CitySelect cities={cities} value={cityId} onChange={setCityId} />
      </div>
      <label className="field-label">
        {t('categoryTitle')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('categoryTitlePlaceholder')} maxLength={80} />
        <small className="translation-helper">{t(category ? 'editLanguageHint' : 'autoTranslationHint')}</small>
      </label>

      <div className="field-label">
        {t('globalIcon')}
        <div className="selected-icon-row">
          <span className="selected-icon"><CatalogIcon name={icon} size={24} /></span>
          <div><strong>{translateIconName(language, icon)}</strong><small>{t('iconNameUsed')}</small></div>
        </div>
        <div className="search-field compact"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchIcon')} /></div>
        <div className="icon-grid">
          {icons.map((name) => (
            <button key={name} type="button" className={icon === name ? 'active' : ''} onClick={() => setIcon(name)} title={translateIconName(language, name)} aria-label={translateIconName(language, name)}>
              <CatalogIcon name={name} size={20} />
              <span>{translateIconName(language, name)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{t('cancel')}</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? t('saving') : t('saveCategory')}</button>
      </div>
    </form>
  );
}
