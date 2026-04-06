import React from "react";
import { observer } from "mobx-react-lite";
import { AdminController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";

type BackupItem = {
  id: string;
  filename: string;
  startedAt: string | null;
  status: string;
  storageProvider: string;
  uploadedLocation?: string | null;
  initiatedBy?: { name?: string | null } | null;
  error?: string | null;
};

export const AdminBackupsView = observer(function AdminBackupsView() {
  const store = useRootStore();
  const adminController = React.useMemo(() => new AdminController(store), [store]);
  const [backups, setBackups] = React.useState<BackupItem[]>([]);
  const [backupError, setBackupError] = React.useState("");
  const [backupRunning, setBackupRunning] = React.useState(false);

  const loadBackups = React.useCallback(async () => {
    try {
      setBackups(await adminController.listBackups());
      setBackupError("");
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "No se pudieron cargar los backups.");
    }
  }, [adminController]);

  React.useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  return (
    <section className="card workspace-shell-card">
      <div className="section-head">
        <div>
          <h3>Backups del server</h3>
          <p className="muted">Genera un dump seguro del server y delega la subida al proveedor configurado en el host.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={backupRunning}
          onClick={async () => {
            setBackupRunning(true);
            try {
              await adminController.runBackup();
              await loadBackups();
            } catch (error) {
              setBackupError(error instanceof Error ? error.message : "El backup fallo.");
            } finally {
              setBackupRunning(false);
            }
          }}
        >
          {backupRunning ? "Ejecutando backup..." : "Ejecutar backup"}
        </button>
      </div>
      {backupError ? <p className="error-text">{backupError}</p> : null}
      <div className="story-task-stack">
        {backups.length === 0 ? <p className="muted">Aun no hay backups registrados.</p> : null}
        {backups.map((backup) => (
          <article key={backup.id} className="story-task-card">
            <div className="story-task-card-head">
              <div>
                <strong>{backup.filename}</strong>
                <p className="muted">{formatDateTime(backup.startedAt)}</p>
              </div>
              <span className={`pill ${backup.status === "FAILED" ? "status status-done" : ""}`}>{backup.status}</span>
            </div>
            <p className="muted">Proveedor: {backup.storageProvider}</p>
            <p className="muted">Ubicacion: {backup.uploadedLocation ?? "Pendiente"}</p>
            <p className="muted">Iniciado por: {backup.initiatedBy?.name ?? "Sistema"}</p>
            {backup.error ? <p className="error-text">{backup.error}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
