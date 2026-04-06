import React from "react";
import { ActivityEntityType } from "@scrum/contracts";
import { ProductController } from "../../../controllers";
import { ActivityFeed } from "./ActivityFeed";

type ActivityTimelineProps = {
  controller: ProductController;
  entityType: ActivityEntityType;
  entityId: string;
  initialEntries?: ActivityEntry[];
};

export type ActivityEntry = React.ComponentProps<typeof ActivityFeed>["entries"][number];

export type ActivityListResult = {
  items: ActivityEntry[];
  page: number;
  pageSize: number;
  total: number;
};

export function ActivityTimeline(props: ActivityTimelineProps) {
  const { controller, entityType, entityId, initialEntries } = props;
  const [entries, setEntries] = React.useState<ActivityEntry[]>(() => initialEntries ?? []);
  const [loading, setLoading] = React.useState(initialEntries === undefined);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (initialEntries === undefined) {
      return;
    }
    setEntries(initialEntries);
    setLoading(false);
    setError("");
  }, [initialEntries]);

  React.useEffect(() => {
    if (initialEntries !== undefined) {
      return;
    }
    let mounted = true;
    setLoading(true);
    setError("");

    void controller
      .loadEntityActivity(entityType, entityId)
      .then((result) => {
        if (!mounted) return;
        const listResult = result as ActivityListResult;
        setEntries(Array.isArray(listResult?.items) ? listResult.items : []);
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
  }, [controller, entityId, entityType, initialEntries]);

  return (
    <section className="card">
      <h4>Historial de actividad</h4>
      {loading ? <p className="muted">Cargando actividad...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && !error && entries.length === 0 ? <p className="muted">Sin actividad registrada.</p> : null}
      <ActivityFeed entries={entries} />
    </section>
  );
}
