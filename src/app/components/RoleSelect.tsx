import { Check, ChevronDown, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import type { UserRole } from '../types';

const ROLES: Array<{ value: UserRole; icon: LucideIcon }> = [
  { value: 'OWNER', icon: ShieldCheck },
  { value: 'COMERCIAL', icon: UserRound },
];

export function RoleSelect({ value, onChange }: { value: UserRole; onChange: (value: UserRole) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(() => Math.max(0, ROLES.findIndex((item) => item.value === value)));
  const ref = useRef<HTMLDivElement>(null);
  const selected = ROLES.find((item) => item.value === value) || ROLES[1]!;
  const SelectedIcon = selected.icon;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function label(role: UserRole) {
    return role === 'OWNER' ? t('owner') : t('commercial');
  }

  function choose(index: number) {
    const item = ROLES[index];
    if (!item) return;
    onChange(item.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((current) => (current + (event.key === 'ArrowDown' ? 1 : ROLES.length - 1)) % ROLES.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(highlight);
      else setOpen(true);
    }
  }

  return (
    <div className="role-select" ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="role-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('role')}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`role-select-icon ${selected.value.toLowerCase()}`} aria-hidden="true"><SelectedIcon size={17} /></span>
        <span className="role-select-copy"><strong>{label(selected.value)}</strong><small>{selected.value}</small></span>
        <ChevronDown size={17} className={open ? 'role-caret open' : 'role-caret'} />
      </button>

      {open && (
        <ul className="role-list" role="listbox" aria-label={t('role')}>
          {ROLES.map((item, index) => {
            const Icon = item.icon;
            const selectedOption = item.value === value;
            return (
              <li key={item.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  className={`${selectedOption ? 'selected' : ''} ${index === highlight ? 'highlight' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(index)}
                >
                  <span className={`role-select-icon ${item.value.toLowerCase()}`} aria-hidden="true"><Icon size={17} /></span>
                  <span className="role-select-copy"><strong>{label(item.value)}</strong><small>{item.value}</small></span>
                  {selectedOption && <Check size={16} className="role-check" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
