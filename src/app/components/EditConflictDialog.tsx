import { ClipboardCopy, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useTranslation } from "../../i18n";
import { Modal } from "./Modal";

export function EditConflictDialog({ entityName, onReload, onCopy, onCancel }: {
  entityName: string;
  onReload: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [busyAction, setBusyAction] = useState<"reload" | "copy" | null>(null);

  async function run(action: "reload" | "copy", operation: () => void | Promise<void>) {
    setBusyAction(action);
    try {
      await operation();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Modal title={t("editConflictTitle")} onClose={onCancel} hideEyebrow>
      <div className="stack-form">
        <p>{t("editConflictMessage", { entity: entityName })}</p>
        <div className="form-actions">
          <button type="button" className="secondary-button" disabled={busyAction !== null} onClick={() => void run("copy", onCopy)}>
            <ClipboardCopy size={16} /> {t("copyMyChanges")}
          </button>
          <button type="button" className="secondary-button" disabled={busyAction !== null} onClick={onCancel}>
            {t("keepEditing")}
          </button>
          <button type="button" className="primary-button" disabled={busyAction !== null} onClick={() => void run("reload", onReload)}>
            <RefreshCw size={16} /> {t("loadLatestVersion")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
