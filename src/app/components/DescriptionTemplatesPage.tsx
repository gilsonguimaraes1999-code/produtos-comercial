import { FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import { CatalogConflictError } from '../supabase/catalogMutations';
import { getCatalogEntityRepository } from '../supabase/catalogEntityRepository';
import type { Category, DescriptionTemplate, DescriptionTemplatePayload, MutationResult } from '../types';
import { CategorySelect } from './CategorySelect';
import { EditConflictDialog } from './EditConflictDialog';
import { RichHtmlEditor } from './RichHtmlEditor';
import { Toast, type ToastState } from './Toast';

const emptyTemplate = (categoryId: string, order: number, title: string): DescriptionTemplatePayload => ({
  categoryId,
  title,
  order,
  active: true,
  htmlBR: '',
  htmlEN: '',
  htmlES: '',
});

export function DescriptionTemplatesPage({
  categories,
  templates,
  onSave,
  onDelete,
}: {
  categories: Category[];
  templates: DescriptionTemplate[];
  onSave: (template: DescriptionTemplatePayload) => Promise<MutationResult>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id || '');
  const [editing, setEditing] = useState<DescriptionTemplatePayload>(() => emptyTemplate(categories[0]?.id || '', 0, t('newDescriptionTemplate')));
  const [editingId, setEditingId] = useState<string | undefined>();
  const [editorLanguage, setEditorLanguage] = useState<'pt' | 'en' | 'es'>('pt');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [conflictDraft, setConflictDraft] = useState<DescriptionTemplatePayload | null>(null);

  const categoryTemplates = useMemo(
    () => templates
      .filter((template) => template.categoryId === selectedCategoryId)
      .sort((first, second) => Number(first.order || 0) - Number(second.order || 0)),
    [selectedCategoryId, templates],
  );

  function startNew() {
    setEditingId(undefined);
    setEditing(emptyTemplate(selectedCategoryId, categoryTemplates.length, t('newDescriptionTemplate')));
    setEditorLanguage('pt');
  }

  function editTemplate(template: DescriptionTemplate) {
    setEditingId(template.id);
    setEditing({
      id: template.id,
      version: template.version,
      categoryId: template.categoryId,
      title: template.title,
      order: template.order,
      active: template.active,
      htmlBR: template.htmlBR || '',
      htmlEN: template.htmlEN || '',
      htmlES: template.htmlES || '',
    });
    setEditorLanguage('pt');
  }

  function updateHtml(value: string) {
    setEditing((current) => ({
      ...current,
      [editorLanguage === 'pt' ? 'htmlBR' : editorLanguage === 'en' ? 'htmlEN' : 'htmlES']: value,
    }));
  }

  async function save() {
    if (!editing.categoryId || !editing.title.trim()) return;
    setSaving(true);
    const draft = { ...editing, id: editingId, title: editing.title.trim(), categoryId: selectedCategoryId };
    try {
      const result = await onSave(draft);
      setEditingId(result.id);
      setEditing((current) => ({ ...current, id: result.id, version: result.version }));
      setToast({ kind: 'success', message: t('templateSaved') });
    } catch (error) {
      if (error instanceof CatalogConflictError) setConflictDraft(draft);
      else setToast({ kind: 'error', message: translateAppError(error, t, 'genericActionError') });
    } finally {
      setSaving(false);
    }
  }

  async function reloadLatestTemplate() {
    if (!editingId) return;
    const latest = await getCatalogEntityRepository().fetchDescriptionTemplate(editingId);
    if (!latest) throw new Error('TEMPLATE_NOT_FOUND');
    setEditing({
      id: latest.id,
      version: latest.version,
      categoryId: latest.categoryId,
      title: latest.title,
      order: latest.order,
      active: latest.active,
      htmlBR: latest.htmlBR,
      htmlEN: latest.htmlEN,
      htmlES: latest.htmlES,
    });
    setSelectedCategoryId(latest.categoryId);
    setConflictDraft(null);
    setToast(null);
  }

  async function remove(template: DescriptionTemplate) {
    setSaving(true);
    try {
      await onDelete(template.id);
      if (editingId === template.id) startNew();
      setToast({ kind: 'success', message: t('templateDeleted') });
    } catch (error) {
      setToast({ kind: 'error', message: translateAppError(error, t, 'genericDeleteError') });
    } finally {
      setSaving(false);
    }
  }

  const currentHtml = editorLanguage === 'pt' ? editing.htmlBR : editorLanguage === 'en' ? editing.htmlEN : editing.htmlES;

  return (
    <section className="description-templates-page">
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
      {conflictDraft && (
        <EditConflictDialog
          entityName={conflictDraft.title}
          onReload={reloadLatestTemplate}
          onCopy={() => navigator.clipboard.writeText(JSON.stringify(conflictDraft, null, 2))}
          onCancel={() => setConflictDraft(null)}
        />
      )}
      <div className="template-page-head">
        <span><FileText size={20} /></span>
        <div>
          <p>{t('configuration')}</p>
          <h1>{t('standardDescription')}</h1>
          <small>{t('standardDescriptionHint')}</small>
        </div>
      </div>

      <div className="template-workspace">
        <aside className="template-list-panel">
          <label className="field-label">
            {t('category')}
            <CategorySelect
              categories={categories}
              value={selectedCategoryId}
              onChange={(value) => {
                setSelectedCategoryId(value);
                setEditingId(undefined);
                setEditing(emptyTemplate(value, templates.filter((template) => template.categoryId === value).length, t('newDescriptionTemplate')));
              }}
            />
          </label>

          <button type="button" className="primary-button compact" onClick={startNew}>
            <Plus size={16} /> {t('newDescriptionTemplate')}
          </button>

          <div className="template-list">
            {categoryTemplates.map((template) => (
              <article key={template.id} className={template.id === editingId ? 'active' : ''}>
                <button type="button" onClick={() => editTemplate(template)}>
                  <strong>{template.title}</strong>
                  <small>{template.active ? 'Ativo' : 'Inativo'} · #{Number(template.order || 0) + 1}</small>
                </button>
                <button type="button" className="icon-danger" onClick={() => void remove(template)} disabled={saving} title={t('delete')}>
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
            {!categoryTemplates.length && <p>{t('noDescriptionTemplates')}</p>}
          </div>
        </aside>

        <form className="template-editor-panel" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="two-columns">
            <label className="field-label">
              {t('templateName')}
              <input value={editing.title} onChange={(event) => setEditing((current) => ({ ...current, title: event.target.value }))} maxLength={120} />
            </label>
            <label className="field-label">
              {t('templateOrder')}
              <input
                type="number"
                min={0}
                value={editing.order || 0}
                onChange={(event) => setEditing((current) => ({ ...current, order: Number(event.target.value || 0) }))}
              />
            </label>
          </div>

          <label className="remember-row template-active-row">
            <input type="checkbox" checked={editing.active} onChange={(event) => setEditing((current) => ({ ...current, active: event.target.checked }))} />
            <span className="remember-dot" />
            {t('activeTemplate')}
          </label>

          <div className="template-language-tabs">
            {(['pt', 'en', 'es'] as const).map((item) => (
              <button key={item} type="button" className={editorLanguage === item ? 'active' : ''} onClick={() => setEditorLanguage(item)}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>

          <RichHtmlEditor value={currentHtml} onChange={updateHtml} />

          <div className="template-help">
            {t('availableVariables')}: <code>{'{{nome}}'}</code>, <code>{'{{armazenamento}}'}</code>, <code>{'{{cds}}'}</code>.
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={startNew}>{t('cancel')}</button>
            <button type="submit" className="primary-button" disabled={saving || !selectedCategoryId}>
              <Save size={16} /> {saving ? t('saving') : t('saveTemplate')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
