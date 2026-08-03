import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from 'react';
import { Input } from './primitives';

export type SearchableOption = {
  value: string;
  label: string;
  keywords?: string;
  group?: string;
};

type Props = {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Open list and focus on mount */
  autoOpen?: boolean;
  /** Called after a value is chosen */
  onSelected?: (value: string) => void;
  id?: string;
  'aria-label'?: string;
  inputRef?: Ref<HTMLInputElement>;
};

function filterOptions(options: SearchableOption[], q: string): SearchableOption[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((o) => {
    const hay = `${o.label} ${o.keywords ?? ''} ${o.group ?? ''}`.toLowerCase();
    return hay.includes(needle);
  });
}

/** Typeahead combobox — mouse and keyboard (↑/↓/Enter/Esc). */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  disabled,
  autoOpen,
  onSelected,
  id,
  'aria-label': ariaLabel,
  inputRef: inputRefProp,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const innerInputRef = useRef<HTMLInputElement>(null);
  const setInputRef = (el: HTMLInputElement | null) => {
    innerInputRef.current = el;
    if (typeof inputRefProp === 'function') inputRefProp(el);
    else if (inputRefProp) (inputRefProp as { current: HTMLInputElement | null }).current = el;
  };

  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => filterOptions(options, query), [options, query]);

  useEffect(() => {
    if (!autoOpen || disabled) return;
    setOpen(true);
    setQuery('');
    const t = window.setTimeout(() => innerInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [autoOpen, disabled]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
    onSelected?.(next);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const opt = filtered[active];
      if (opt) commit(opt.value);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const display = open ? query : selected?.label ?? '';

  return (
    <div className={`searchable-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <Input
        ref={setInputRef}
        id={id}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        role="combobox"
        disabled={disabled}
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
            setQuery('');
          }
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && !disabled ? (
        <ul id={listId} className="searchable-select-list" role="listbox">
          {!filtered.length ? (
            <li className="searchable-select-empty muted">No matches</li>
          ) : (
            filtered.map((opt, idx) => (
              <li key={opt.value} role="option" aria-selected={opt.value === value}>
                <button
                  type="button"
                  className={`searchable-select-option${idx === active ? ' is-active' : ''}${
                    opt.value === value ? ' is-selected' : ''
                  }`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => commit(opt.value)}
                >
                  <span>{opt.label}</span>
                  {opt.group ? <span className="muted searchable-select-group">{opt.group}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
