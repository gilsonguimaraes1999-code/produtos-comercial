import { CopyPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import { localizedCategoryTitle } from '../localization';
import type { Category, City } from '../types';
import { CategorySelect } from './CategorySelect';
import { CitySelect } from './CitySelect';

export function CloneProductDialog({ cities, categories, sourceCategoryId, onCancel, onConfirm }: {
  cities: City[];
  categories: Category[];
  sourceCategoryId: string;
  onCancel: () => void;
  onConfirm: (targetCategoryId: string) => Promise<void>;
}) {
  const { language, t } = useTranslation();
  const sourceCategory = categories.find((category) => category.id === sourceCategoryId);
  const [cityId, setCityId] = useState(sourceCategory?.cityId || cities[0]?.id || '');
  const cityCategories = useMemo(() => categories.filter((category) => category.cityId === cityId), [categories, cityId]);
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveCategoryId = categoryId || cityCategories[0]?.id || '';

  async function confirm() {
    if (!effectiveCategoryId) return;
    setSaving(true);
    try {
      await onConfirm(effectiveCategoryId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack-form">
      <div className="two-columns">
        <div className="field-label">{t('targetCity')}<CitySelect cities={cities} value={cityId} onChange={(value) => { setCityId(value); setCategoryId(''); }} /></div>
        <div className="field-label">{t('targetCategory')}<CategorySelect categories={cityCategories} value={effectiveCategoryId} onChange={setCategoryId} /></div>
      </div>
      <p className="helper-text"><CopyPlus size={14} /> {t('cloneProductHint', { category: sourceCategory ? localizedCategoryTitle(sourceCategory, language) : '' })}</p>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="primary-button" disabled={saving || !effectiveCategoryId} onClick={() => void confirm()}>{saving ? t('saving') : t('cloneProduct')}</button>
      </div>
    </div>
  );
}

export function CloneCategoryDialog({ cities, onCancel, onConfirm }: {
  cities: City[];
  onCancel: () => void;
  onConfirm: (targetCityId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [cityId, setCityId] = useState(cities[0]?.id || '');
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!cityId) return;
    setSaving(true);
    try {
      await onConfirm(cityId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack-form">
      <div className="field-label">{t('targetCity')}<CitySelect cities={cities} value={cityId} onChange={setCityId} /></div>
      <p className="helper-text"><CopyPlus size={14} /> {t('cloneCategoryHint')}</p>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="primary-button" disabled={saving || !cityId} onClick={() => void confirm()}>{saving ? t('saving') : t('cloneCategory')}</button>
      </div>
    </div>
  );
}
