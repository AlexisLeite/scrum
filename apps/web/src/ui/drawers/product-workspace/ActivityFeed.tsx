import React from "react";

type ActivityEntry = {
  id: string;
  action?: string;
  createdAt?: string;
  actor?: { id?: string; name?: string; email?: string } | null;
  actorUser?: { id?: string; name?: string; email?: string } | null;
  summary?: string;
  details?: string;
  detail?: {
    summary?: string;
    details?: string;
  };
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

function resolveSummary(entry: ActivityEntry): string {
  return entry.detail?.summary ?? entry.summary ?? entry.action ?? "actualizacion";
}

function resolveDetails(entry: ActivityEntry): string {
  return entry.detail?.details ?? entry.details ?? "";
}

export function ActivityFeed(props: { entries: ActivityEntry[]; emptyLabel?: string }) {
  const { entries, emptyLabel = "Sin actividad registrada." } = props;

  return (
    <ul className="plain-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <strong>{resolveSummary(entry)}</strong>
          <span className="muted"> por {resolveActorName(entry)} en {formatDateTime(entry.createdAt)}</span>
          {resolveDetails(entry) ? <p className="muted">{resolveDetails(entry)}</p> : null}
        </li>
      ))}
      {entries.length === 0 ? <li className="muted">{emptyLabel}</li> : null}
    </ul>
  );
}
