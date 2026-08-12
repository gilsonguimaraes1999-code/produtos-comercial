import { Building2, Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { City } from '../types';
import { useTranslation } from '../../i18n';

export function CitySelect({ cities, value, onChange, compact = false }: {
  cities: City[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selectedIndex = useMemo(() => Math.max(0, cities.findIndex((city) => city.id === value)), [cities, value]);
  const selected = cities.find((city) => city.id === value) || cities[0] || null;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function choose(index: number) {
    const city = cities[index];
    if (!city) return;
    onChange(city.id);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!cities.length) return;
      if (!open) {
        setHighlight(selectedIndex);
        setOpen(true);
        return;
      }
      setHighlight((current) => (current + (event.key === 'ArrowDown' ? 1 : cities.length - 1)) % cities.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(highlight);
      else setOpen(true);
    }
  }

  return (
    <div className={`city-select${compact ? ' compact' : ''}`} ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="city-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('city')}
        disabled={!cities.length}
        onClick={() => {
          if (!cities.length) return;
          setHighlight(selectedIndex);
          setOpen((current) => !current);
        }}
      >
        <span className="city-select-icon" aria-hidden="true"><Building2 size={compact ? 15 : 16} /></span>
        <span className="city-name">{selected ? selected.name : t('selectCity')}</span>
        <ChevronDown size={16} className={open ? 'city-caret open' : 'city-caret'} />
      </button>
      {open && cities.length > 0 && (
        <ul className="city-listbox" role="listbox" aria-label={t('city')}>
          {cities.map((city, index) => {
            const isSelected = city.id === value;
            return (
              <li key={city.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`${isSelected ? 'selected' : ''} ${index === highlight ? 'highlight' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(index)}
                >
                  <span className="city-select-icon" aria-hidden="true"><Building2 size={15} /></span>
                  <span className="city-name">{city.name}</span>
                  {isSelected && <Check size={16} className="city-check" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
