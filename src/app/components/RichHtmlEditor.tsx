import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code2,
  Copy,
  Eraser,
  Eye,
  List,
  ListOrdered,
  Palette,
  Table,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { sanitizeHtml } from '../html';

type EditorMode = 'visual' | 'html';
type ColorTarget = 'text' | 'background';
const COLOR_SWATCHES = [
  '#57c878', '#1abc9c', '#5dade2', '#2e86de', '#9b59b6', '#56627a', '#d5d8dc',
  '#27ae60', '#16a085', '#3498db', '#2874a6', '#6c3483', '#222f5b', '#111111',
  '#334000', '#f39c12', '#ff6b57', '#e74c3c', '#a1887f', '#2f3237', '#000000',
  '#f1c40f', '#ff7f32', '#e84141', '#b93131', '#7f6d66', '#343a40', '#ffffff',
];

function command(name: string, value?: string) {
  document.execCommand(name, false, value);
}

function normalizeEditorHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('font').forEach((font) => {
    const span = document.createElement('span');
    const styles: string[] = [];
    const color = font.getAttribute('color');
    const face = font.getAttribute('face');

    if (color) styles.push(`color: ${color}`);
    if (face) styles.push(`font-family: ${face}`);
    if (font.getAttribute('size') === '7') styles.push('font-size: 48px');
    if (styles.length) span.setAttribute('style', styles.join('; '));

    span.innerHTML = font.innerHTML;
    font.replaceWith(span);
  });

  return template.innerHTML;
}

export function RichHtmlEditor({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [mode, setMode] = useState<EditorMode>('visual');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorTarget, setColorTarget] = useState<ColorTarget>('text');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 1, cols: 1 });

  useEffect(() => {
    if (mode === 'visual' && editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [mode, value]);

  function updateFromEditor() {
    const normalized = normalizeEditorHtml(editorRef.current?.innerHTML || '');
    onChange(sanitizeHtml(normalized));
  }

  function currentHtml() {
    if (mode === 'visual') {
      return sanitizeHtml(normalizeEditorHtml(editorRef.current?.innerHTML || value));
    }
    return sanitizeHtml(value);
  }

  function saveSelection() {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function run(name: string, next?: string) {
    restoreSelection();
    command(name, next);
    updateFromEditor();
    editorRef.current?.focus();
  }

  function normalizeHexColor(color: string) {
    const trimmed = color.trim();
    if (/^#[0-9a-f]{3}$/i.test(trimmed) || /^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
    if (/^[0-9a-f]{3}$/i.test(trimmed) || /^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed}`;
    return '';
  }

  function applyColor(color: string) {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    editorRef.current?.focus();
    restoreSelection();
    command(colorTarget === 'text' ? 'foreColor' : 'hiliteColor', normalized);
    if (colorTarget === 'background') command('backColor', normalized);
    setCustomColor(normalized);
    updateFromEditor();
  }

  function insertTable(rows: number, cols: number) {
    const cells = Array.from({ length: rows }, () =>
      '<tr>' +
      Array.from({ length: cols }, () => (
        '<td style="border:1px solid rgba(255,255,255,.18); min-width:88px; height:30px; padding:6px;">&nbsp;</td>'
      )).join('') +
      '</tr>',
    ).join('');
    run('insertHTML', '<table style="width:100%; border-collapse:collapse; table-layout:fixed;"><tbody>' + cells + '</tbody></table>');
    setTablePickerOpen(false);
  }

  async function copyHtml() {
    await navigator.clipboard.writeText(currentHtml());
  }

  const tools = [
    { icon: Bold, label: t('bold'), action: () => run('bold') },
    { icon: AlignLeft, label: t('alignLeft'), action: () => run('justifyLeft') },
    { icon: AlignCenter, label: t('alignCenter'), action: () => run('justifyCenter') },
    { icon: AlignRight, label: t('alignRight'), action: () => run('justifyRight') },
    { icon: ListOrdered, label: t('numberedList'), action: () => run('insertOrderedList') },
    { icon: List, label: t('bulletList'), action: () => run('insertUnorderedList') },
    { icon: Eraser, label: t('clearFormatting'), action: () => run('removeFormat') },
  ];

  return (
    <div className="html-editor">
      <div className="html-toolbar">
        {tools.map((tool, index) => (
          <Fragment key={tool.label}>
            <button type="button" onClick={tool.action} title={tool.label} aria-label={tool.label}>
              <tool.icon size={16} />
            </button>
            {index === 0 && (
              <div className="html-color-control">
                <button
                  type="button"
                  onClick={() => {
                    setColorPickerOpen((current) => !current);
                    setTablePickerOpen(false);
                  }}
                  title={t('textColor')}
                  aria-label={t('textColor')}
                  className={colorPickerOpen ? 'active' : ''}
                >
                  <Palette size={16} /> <ChevronDown size={12} />
                </button>
                {colorPickerOpen && (
                  <div className="html-color-picker">
                    <div className="html-color-tabs">
                      <button type="button" className={colorTarget === 'text' ? 'active' : ''} onClick={() => setColorTarget('text')}>
                        Text
                      </button>
                      <button type="button" className={colorTarget === 'background' ? 'active' : ''} onClick={() => setColorTarget('background')}>
                        Background
                      </button>
                    </div>
                    <div className="html-color-grid" aria-label="Color palette">
                      {COLOR_SWATCHES.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="html-color-swatch"
                          style={{ backgroundColor: color }}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applyColor(color)}
                          title={color}
                          aria-label={color}
                        />
                      ))}
                    </div>
                    <div className="html-color-hex-row">
                      <input
                        value={customColor}
                        onChange={(event) => setCustomColor(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') applyColor(customColor);
                        }}
                        placeholder="HEX Color"
                        spellCheck={false}
                      />
                      <button type="button" onClick={() => applyColor(customColor)}>OK</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Fragment>
        ))}
        <div className="html-table-control">
          <button
            type="button"
            onClick={() => {
              setTablePickerOpen((current) => !current);
              setColorPickerOpen(false);
            }}
            title={t('insertTable')}
            aria-label={t('insertTable')}
            className={tablePickerOpen ? 'active' : ''}
          >
            <Table size={16} />
          </button>
          {tablePickerOpen && (
            <div className="html-table-picker">
              <strong>{tableSize.rows} x {tableSize.cols}</strong>
              <div className="html-table-grid" style={{ '--table-cols': 10 } as CSSProperties}>
                {Array.from({ length: 100 }, (_, index) => {
                  const row = Math.floor(index / 10) + 1;
                  const col = (index % 10) + 1;
                  const active = row <= tableSize.rows && col <= tableSize.cols;
                  return (
                    <button
                      key={index}
                      type="button"
                      className={active ? 'active' : ''}
                      onMouseEnter={() => setTableSize({ rows: row, cols: col })}
                      onFocus={() => setTableSize({ rows: row, cols: col })}
                      onClick={() => insertTable(row, col)}
                      aria-label={`${row} x ${col}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setMode(mode === 'visual' ? 'html' : 'visual')} className={mode === 'html' ? 'active' : ''}>
          <Code2 size={16} /> {mode === 'html' ? t('htmlCode') : t('visualEditor')}
        </button>
        <button type="button" onClick={() => void copyHtml()}><Copy size={16} /> {t('copyHtml')}</button>
      </div>

      {mode === 'html' ? (
        <textarea className="html-code-input" value={value} onChange={(event) => onChange(sanitizeHtml(event.target.value))} spellCheck={false} />
      ) : (
        <div
          ref={editorRef}
          className="html-visual-input"
          contentEditable
          onInput={updateFromEditor}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={saveSelection}
          suppressContentEditableWarning
        />
      )}

      <button type="button" className="html-preview-toggle" onClick={() => setPreviewOpen((current) => !current)}>
        <Eye size={14} /> {t('descriptionPreview')}
      </button>
      {previewOpen && (
        <div className="html-preview">
          <div className="rich-content product-description" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) || `<p>${t('emptyDescriptionPreview')}</p>` }} />
        </div>
      )}
    </div>
  );
}
