import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';

export type FilterOption = { value: string; label: string };

export function UserFilterSelect({ value, options, onChange, ariaLabel, icon: Icon }: {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  icon: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') return setOpen(false);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setHighlight(selectedIndex);
        return setOpen(true);
      }
      const step = event.key === 'ArrowDown' ? 1 : options.length - 1;
      setHighlight((current) => (current + step) % options.length);
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(highlight);
      else setOpen(true);
    }
  }

  return (
    <div className="user-filter-select" ref={ref} onKeyDown={onKeyDown}>
      <button type="button" className="user-filter-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => { setHighlight(selectedIndex); setOpen((current) => !current); }}>
        <span className="user-filter-icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="user-filter-value">{selected?.label || ariaLabel}</span>
        <ChevronDown size={15} className={open ? 'user-filter-caret open' : 'user-filter-caret'} />
      </button>
      {open && (
        <ul className="user-filter-options" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value}>
                <button type="button" role="option" aria-selected={isSelected} className={`${isSelected ? 'selected' : ''} ${index === highlight ? 'highlight' : ''}`} onMouseEnter={() => setHighlight(index)} onClick={() => choose(index)}>
                  <span>{option.label}</span>
                  {isSelected && <Check size={15} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function formatValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplay(value: string, locale: string, placeholder: string) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat(locale).format(date) : placeholder;
}

export function UserFilterDatePicker({ value, onChange, ariaLabel, min }: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  min?: string | undefined;
}) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = parseDate(value) || new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const ref = useRef<HTMLDivElement>(null);
  const selectedDate = parseDate(value);
  const minDate = min ? parseDate(min) : null;
  const today = new Date();
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 7, 2 + index);
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date);
  }), [locale]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  function select(date: Date) {
    if (minDate && date < minDate) return;
    onChange(formatValue(date));
    setOpen(false);
  }

  return (
    <div className="user-date-picker" ref={ref}>
      <button type="button" className="user-filter-trigger user-date-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} onClick={() => { const next = selectedDate || new Date(); setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1)); setOpen((current) => !current); }}>
        <span className="user-filter-icon" aria-hidden="true"><CalendarDays size={15} /></span>
        <span className={`user-filter-value${value ? '' : ' placeholder'}`}>{formatDisplay(value, locale, t('datePlaceholder'))}</span>
        <ChevronDown size={15} className={open ? 'user-filter-caret open' : 'user-filter-caret'} />
      </button>
      {open && (
        <div className="user-calendar-popover" role="dialog" aria-modal="false" aria-label={ariaLabel}>
          <div className="user-calendar-head">
            <strong>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewMonth)}</strong>
            <div>
              <button type="button" onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label={t('previousMonth')}><ChevronLeft size={17} /></button>
              <button type="button" onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label={t('nextMonth')}><ChevronRight size={17} /></button>
            </div>
          </div>
          <div className="user-calendar-weekdays">{weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <div className="user-calendar-grid">
            {days.map((date) => {
              const key = formatValue(date);
              const outside = date.getMonth() !== viewMonth.getMonth();
              const selected = selectedDate ? formatValue(selectedDate) === key : false;
              const isToday = formatValue(today) === key;
              const disabled = Boolean(minDate && date < minDate);
              return <button key={key} type="button" disabled={disabled} className={`${outside ? 'outside' : ''} ${selected ? 'selected' : ''} ${isToday ? 'today' : ''}`} onClick={() => select(date)} aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)}>{date.getDate()}</button>;
            })}
          </div>
          <div className="user-calendar-actions">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}>{t('clearDate')}</button>
            <button type="button" onClick={() => select(new Date())} disabled={Boolean(minDate && today < minDate)}>{t('today')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
