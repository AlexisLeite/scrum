import React from "react";
import { ProductController } from "../../../controllers";

type ActivityTimelineProps = {
  controller: ProductController;
  entityType: "stories" | "tasks" | "sprints";
  entityId: string;
};

type ActivityEntry = {
  id: string;
  action?: string;
  createdAt?: string;
  actor?: { id?: string; name?: string; email?: string } | null;
  actorUser?: { id?: string; name?: string; email?: string } | null;
  summary?: string;
  details?: string;
};

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function resolveActorName(entry: ActivityEntry): string {
  return entry.actor?.name ?? entry.actorUser?.name ?? entry.actor?.email ?? entry.actorUser?.email ?? "Sistema";
}

export function ActivityTimeline(props: ActivityTimelineProps) {
  const { controller, entityType, entityId } = props;
  const [entries, setEntries] = React.useState<ActivityEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    void controller
      .loadEntityActivity(entityType, entityId)
      .then((result) => {
        if (!mounted) return;
        setEntries(Array.isArray(result) ? (result as ActivityEntry[]) : []);
      })
      .catch((loadError: unknown) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la actividad.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [controller, entityId, entityType]);

  return (
    <section className="card">
      <h4>Historial de actividad</h4>
      {loading ? <p className="muted">Cargando actividad...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && !error && entries.length === 0 ? <p className="muted">Sin actividad registrada.</p> : null}
      <ul className="plain-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.action ?? entry.summary ?? "actualizacion"}</strong>
            <span className="muted"> por {resolveActorName(entry)} en {formatDateTime(entry.createdAt)}</span>
            {entry.details ? <p className="muted">{entry.details}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
