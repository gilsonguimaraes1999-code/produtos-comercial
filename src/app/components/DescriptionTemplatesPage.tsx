import { FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import type { Category, DescriptionTemplate, DescriptionTemplatePayload } from '../types';
import { CategorySelect } from './CategorySelect';
import { RichHtmlEditor } from './RichHtmlEditor';
import { Toast, type ToastState } from './Toast';

const emptyTemplate = (categoryId: string, order: number): DescriptionTemplatePayload => ({
  categoryId,
  title: 'Novo padrão',
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
  onSave: (template: DescriptionTemplatePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id || '');
  const [editing, setEditing] = useState<DescriptionTemplatePayload>(() => emptyTemplate(categories[0]?.id || '', 0));
  const [editingId, setEditingId] = useState<string | undefined>();
  const [editorLanguage, setEditorLanguage] = useState<'pt' | 'en' | 'es'>('pt');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const categoryTemplates = useMemo(
    () => templates
      .filter((template) => template.categoryId === selectedCategoryId)
      .sort((first, second) => Number(first.order || 0) - Number(second.order || 0)),
    [selectedCategoryId, templates],
  );

  function startNew() {
    setEditingId(undefined);
    setEditing(emptyTemplate(selectedCategoryId, categoryTemplates.length));
    setEditorLanguage('pt');
  }

  function editTemplate(template: DescriptionTemplate) {
    setEditingId(template.id);
    setEditing({
      id: template.id,
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
    try {
      await onSave({ ...editing, id: editingId, title: editing.title.trim(), categoryId: selectedCategoryId });
      setToast({ kind: 'success', message: 'Padrão salvo com sucesso.' });
    } catch (error) {
      setToast({ kind: 'error', message: translateAppError(error, t, 'genericActionError') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: DescriptionTemplate) {
    setSaving(true);
    try {
      await onDelete(template.id);
      if (editingId === template.id) startNew();
      setToast({ kind: 'success', message: 'Padrão excluído com sucesso.' });
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
      <div className="template-page-head">
        <span><FileText size={20} /></span>
        <div>
          <p>{t('configuration')}</p>
          <h1>Descrição Padrão</h1>
          <small>Crie mais de um HTML por categoria e mantenha versões em PT, EN e ES.</small>
        </div>
      </div>

      <div className="template-workspace">
        <aside className="template-list-panel">
          <label className="field-label">
            Categoria
            <CategorySelect
              categories={categories}
              value={selectedCategoryId}
              onChange={(value) => {
                setSelectedCategoryId(value);
                setEditingId(undefined);
                setEditing(emptyTemplate(value, templates.filter((template) => template.categoryId === value).length));
              }}
            />
          </label>

          <button type="button" className="primary-button compact" onClick={startNew}>
            <Plus size={16} /> Novo padrão
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
            {!categoryTemplates.length && <p>Nenhum padrão criado para esta categoria.</p>}
          </div>
        </aside>

        <form className="template-editor-panel" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="two-columns">
            <label className="field-label">
              Nome do padrão
              <input value={editing.title} onChange={(event) => setEditing((current) => ({ ...current, title: event.target.value }))} maxLength={120} />
            </label>
            <label className="field-label">
              Ordem
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
            Padrão ativo
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
            Variáveis disponíveis: <code>{'{{nome}}'}</code>, <code>{'{{armazenamento}}'}</code>, <code>{'{{cds}}'}</code>.
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={startNew}>{t('cancel')}</button>
            <button type="submit" className="primary-button" disabled={saving || !selectedCategoryId}>
              <Save size={16} /> {saving ? t('saving') : 'Salvar padrão'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
