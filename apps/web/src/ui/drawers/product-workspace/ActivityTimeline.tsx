import React from "react";
import { ActivityEntityType } from "@scrum/contracts";
import { ProductController } from "../../../controllers";
import { ActivityFeed } from "./ActivityFeed";

type ActivityTimelineProps = {
  controller: ProductController;
  entityType: ActivityEntityType;
  entityId: string;
};

type ActivityEntry = React.ComponentProps<typeof ActivityFeed>["entries"][number];

type ActivityListResult = {
  items: ActivityEntry[];
  page: number;
  pageSize: number;
  total: number;
};

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
  }, [controller, entityId, entityType]);

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
