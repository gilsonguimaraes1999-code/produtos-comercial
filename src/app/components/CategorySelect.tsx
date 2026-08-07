import { Check, ChevronDown, LayoutGrid } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { localizedCategoryTitle } from '../localization';
import type { Category } from '../types';

export function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { language, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selectedIndex = useMemo(() => Math.max(0, categories.findIndex((item) => item.id === value)), [categories, value]);
  const [highlight, setHighlight] = useState(selectedIndex);
  const ref = useRef<HTMLDivElement>(null);
  const selected = categories.find((item) => item.id === value) || categories[0] || null;

  useEffect(() => {
    setHighlight(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function choose(index: number) {
    const item = categories[index];
    if (!item) return;
    onChange(item.id);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!categories.length) return;
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((current) => (current + (event.key === 'ArrowDown' ? 1 : categories.length - 1)) % categories.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!categories.length) return;
      if (open) choose(highlight);
      else setOpen(true);
    }
  }

  return (
    <div className="category-select" ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="category-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('category')}
        onClick={() => setOpen((current) => !current)}
        disabled={!categories.length}
      >
        <span className="category-select-icon" aria-hidden="true"><LayoutGrid size={16} /></span>
        <span className="category-name">{selected ? localizedCategoryTitle(selected, language) : t('select')}</span>
        <ChevronDown size={16} className={open ? 'category-caret open' : 'category-caret'} />
      </button>
      {open && categories.length > 0 && (
        <ul className="category-list" role="listbox" aria-label={t('category')}>
          {categories.map((item, index) => {
            const isSelected = item.id === value;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`${isSelected ? 'selected' : ''} ${index === highlight ? 'highlight' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(index)}
                >
                  <span className="category-select-icon" aria-hidden="true"><LayoutGrid size={16} /></span>
                  <span className="category-name">{localizedCategoryTitle(item, language)}</span>
                  {isSelected && <Check size={16} className="category-check" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
