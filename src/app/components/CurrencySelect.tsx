import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import type { CurrencyCode } from '../types';

export const CURRENCIES: Array<{ value: CurrencyCode; flag: string; symbol: string }> = [
  { value: 'BRL', flag: 'BR', symbol: 'R$' },
  { value: 'USD', flag: 'US', symbol: '$' },
  { value: 'GBP', flag: 'GB', symbol: '£' },
  { value: 'EUR', flag: 'EU', symbol: '€' },
];

export function CurrencySelect({ value, onChange, excluded = [] }: { value: CurrencyCode; onChange: (value: CurrencyCode) => void; excluded?: CurrencyCode[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const options = CURRENCIES.filter((item) => item.value === value || !excluded.includes(item.value));
  const selected = CURRENCIES.find((item) => item.value === value) || CURRENCIES[0]!;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function currencyName(code: CurrencyCode) {
    return t(`currency_${code}` as never);
  }

  function choose(index: number) {
    const item = options[index];
    if (!item) return;
    onChange(item.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setHighlight(Math.max(0, options.findIndex((item) => item.value === value))); setOpen(true); return; }
      setHighlight((current) => (current + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(highlight);
      else setOpen(true);
    }
  }

  return (
    <div className="currency-select" ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="currency-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('currency')}
        onClick={() => { setHighlight(Math.max(0, options.findIndex((item) => item.value === value))); setOpen((current) => !current); }}
      >
        <span className="currency-flag" aria-hidden="true">{selected.flag}</span>
        <span className="currency-name">{currencyName(selected.value)}</span>
        <span className="currency-symbol">{selected.symbol}</span>
        <ChevronDown size={16} className={open ? 'currency-caret open' : 'currency-caret'} />
      </button>
      {open && (
        <ul className="currency-list" role="listbox" aria-label={t('currency')}>
          {options.map((item, index) => (
            <li key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={item.value === value}
                className={`${item.value === value ? 'selected' : ''} ${index === highlight ? 'highlight' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(index)}
              >
                <span className="currency-flag" aria-hidden="true">{item.flag}</span>
                <span className="currency-name">{currencyName(item.value)}</span>
                <span className="currency-symbol">{item.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
