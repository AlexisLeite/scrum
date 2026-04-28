import React from "react";
import { observer } from "mobx-react-lite";
import { ApiKeyDto, ApiKeyKind, ProductDto, StoryDto } from "@scrum/contracts";
import { apiClient } from "../api/client";
import { AuthController, ProductController } from "../controllers";
import { getUserInitials } from "../lib/permissions";
import { useRootStore } from "../stores/root-store";
import { SearchableSelect, buildSearchableSelectOptions } from "../ui/SearchableSelect";

type ActivityStats = {
  activityCount: number;
  activeDays: number;
  tasksWorked: number;
  sprintActions: number;
  averageVelocity: number;
  window: string;
  from: string;
  to: string;
  velocityBySprint: Array<{ sprintId: string; sprintName: string; completedPoints: number }>;
};

const statsWindows = ["week", "month", "semester", "year"] as const;
type StatsWindow = typeof statsWindows[number];
type ApiKeysSortOrder = "newest" | "oldest";
const apiKeyKindOptions: ApiKeyKind[] = ["MCP_ACCESS", "INCIDENT_REPORT"];
const apiKeyKindLabels: Record<ApiKeyKind, string> = {
  MCP_ACCESS: "Acceso MCP",
  INCIDENT_REPORT: "Reporte de incidentes"
};
const apiKeyKindDescriptions: Record<ApiKeyKind, string> = {
  MCP_ACCESS: "Usa permisos y producto como las integraciones MCP actuales.",
  INCIDENT_REPORT: "Publica reportes markdown en una historia del sprint activo."
};

function getApiKeyKindClass(kind: ApiKeyKind) {
  return kind.toLowerCase().replace(/_/g, "-");
}

export const SettingsView = observer(function SettingsView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const user = store.session.user;
  const [name, setName] = React.useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl ?? "");
  const [windowSize, setWindowSize] = React.useState<StatsWindow>("month");
  const [stats, setStats] = React.useState<ActivityStats | null>(null);
  const [statsError, setStatsError] = React.useState("");
  const [apiKeys, setApiKeys] = React.useState<ApiKeyDto[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = React.useState(true);
  const [apiKeysError, setApiKeysError] = React.useState("");
  const [newApiKeyName, setNewApiKeyName] = React.useState("");
  const [newApiKeyKind, setNewApiKeyKind] = React.useState<ApiKeyKind>("MCP_ACCESS");
  const [newApiKeyProductId, setNewApiKeyProductId] = React.useState("");
  const [newApiKeyStoryId, setNewApiKeyStoryId] = React.useState("");
  const [newApiKeyCode, setNewApiKeyCode] = React.useState("");
  const [newApiKeyCodeKind, setNewApiKeyCodeKind] = React.useState<ApiKeyKind>("MCP_ACCESS");
  const [apiKeysBusy, setApiKeysBusy] = React.useState(false);
  const [availableProducts, setAvailableProducts] = React.useState<ProductDto[]>([]);
  const [availableApiKeyStories, setAvailableApiKeyStories] = React.useState<StoryDto[]>([]);
  const [apiKeyStoriesLoading, setApiKeyStoriesLoading] = React.useState(false);
  const [apiKeysSortOrder, setApiKeysSortOrder] = React.useState<ApiKeysSortOrder>("newest");

  React.useEffect(() => {
    setName(user?.name ?? "");
    setAvatarUrl(user?.avatarUrl ?? "");
  }, [user?.avatarUrl, user?.name]);

  React.useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    setApiKeysLoading(true);
    void auth.listApiKeys()
      .then((items) => {
        if (!active) {
          return;
        }
        setApiKeys(items);
        setApiKeysError("");
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setApiKeys([]);
        setApiKeysError(error instanceof Error ? error.message : "No se pudieron cargar las API keys.");
      })
      .finally(() => {
        if (active) {
          setApiKeysLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [auth, user]);

  React.useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;
    void productController.loadProducts()
      .then((products) => {
        if (!active) {
          return;
        }
        setAvailableProducts(products);
        setNewApiKeyProductId((current) => current || products[0]?.id || "");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAvailableProducts([]);
        setNewApiKeyProductId("");
      });

    return () => {
      active = false;
    };
  }, [productController, user]);

  React.useEffect(() => {
    if (!user || newApiKeyKind !== "INCIDENT_REPORT" || !newApiKeyProductId) {
      setAvailableApiKeyStories([]);
      setNewApiKeyStoryId("");
      setApiKeyStoriesLoading(false);
      return;
    }

    let active = true;
    setApiKeyStoriesLoading(true);
    void productController.loadStories(newApiKeyProductId, { syncStore: false })
      .then((stories) => {
        if (!active) {
          return;
        }
        const selectableStories = (stories as StoryDto[]).filter((story) => story.status !== "CLOSED");
        setAvailableApiKeyStories(selectableStories);
        setNewApiKeyStoryId((current) =>
          selectableStories.some((story) => story.id === current) ? current : selectableStories[0]?.id ?? ""
        );
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setAvailableApiKeyStories([]);
        setNewApiKeyStoryId("");
        setApiKeysError(error instanceof Error ? error.message : "No se pudieron cargar las historias del producto.");
      })
      .finally(() => {
        if (active) {
          setApiKeyStoriesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [newApiKeyKind, newApiKeyProductId, productController, user]);

  React.useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const [activityStats] = await Promise.all([
          apiClient.get<ActivityStats>(`/activity/users/${user.id}/stats?window=${windowSize}`),
          productController.loadUserVelocityByWindow(user.id, windowSize)
        ]);
        if (!active) {
          return;
        }
        setStats(activityStats);
        setStatsError("");
      } catch (error) {
        if (!active) {
          return;
        }
        setStats(null);
        setStatsError(error instanceof Error ? error.message : "No se pudieron cargar tus metricas.");
      }
    })();

    return () => {
      active = false;
    };
  }, [productController, user, windowSize]);

  if (!user) {
    return null;
  }

  const apiKeyProductOptions = availableProducts.map((product) => ({
    value: product.id,
    label: `${product.name} (${product.key})`,
    searchText: `${product.name} ${product.key}`
  }));
  const apiKeyRequiresStory = newApiKeyKind === "INCIDENT_REPORT";
  const apiKeyStoryOptions = availableApiKeyStories.map((story) => ({
    value: story.id,
    label: `${story.title} (${story.status})`,
    searchText: `${story.title} ${story.status}`
  }));
  const canCreateApiKey =
    !apiKeysBusy &&
    newApiKeyName.trim().length >= 2 &&
    Boolean(newApiKeyProductId) &&
    (!apiKeyRequiresStory || (!apiKeyStoriesLoading && Boolean(newApiKeyStoryId)));
  const sortedApiKeys = [...apiKeys].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return apiKeysSortOrder === "newest" ? rightTime - leftTime : leftTime - rightTime;
  });
  const apiKeysCountLabel = apiKeysLoading
    ? "Sincronizando keys"
    : `${apiKeys.length} ${apiKeys.length === 1 ? "key creada" : "keys creadas"}`;

  return (
    <div className="stack-lg">
      <section className="card definition-hero">
        <div className="definition-hero-main">
          <div>
            <p className="workspace-context">Settings</p>
            <h2>Cuenta personal</h2>
            <p className="muted">
              Actualiza tu identidad visible y revisa tu actividad reciente sin salir del workspace principal.
            </p>
          </div>
          <div className="definition-hero-context">
            <span className="brand-badge">{getUserInitials(name || user.name)}</span>
            <span className="pill">{user.email}</span>
            <span className={`status status-${(user.role ?? "team_member").replace(/_/g, "-")}`}>{user.role ?? "team_member"}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Perfil visible</h3>
            <p className="muted">Nombre y avatar que aparecen en menus, actividad y colaboracion.</p>
          </div>
        </div>
        <div className="definition-grid api-keys-grid">
          <div className="form-grid api-keys-form">
            <label>
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Avatar URL
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />
            </label>
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => void auth.updateProfile({ name, avatarUrl })}>
                Guardar cambios
              </button>
            </div>
          </div>
          <div className="stack-lg">
            <div className="definition-note">
              <span className="muted">Cuenta activa</span>
              <strong>{name || user.name}</strong>
              <span className="pill">{user.email}</span>
            </div>
            <div className="definition-note">
              <span className="muted">Avatar actual</span>
              <strong>{avatarUrl ? "URL configurada" : "Sin avatar personalizado"}</strong>
              <span className="muted">{avatarUrl || "Se usan iniciales como fallback en la interfaz."}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head api-keys-section-head">
          <div className="api-keys-section-copy">
            <h3>API keys</h3>
            <p className="muted">Cada key se asigna a un producto accesible y queda limitada a su tipo de integración.</p>
          </div>
        </div>
        <div className="api-keys-layout">
          <div className="api-keys-create-shell">
            <div className="api-keys-create-head">
              <div className="api-keys-create-copy">
                <span className="workspace-context">Crear credencial</span>
                <h4>Nueva API key</h4>
                <p className="muted">
                  Define un nombre reconocible, elegi el alcance correcto y genera una credencial para MCP o reportes externos.
                </p>
              </div>
              <div className="api-keys-create-stats">
                <div>
                  <span className="muted">Productos accesibles</span>
                  <strong>{availableProducts.length} disponibles</strong>
                </div>
              </div>
            </div>
            <div className="form-grid api-keys-form-shell">
              <div className="api-keys-form-grid">
                <label>
                  Nombre
                  <input
                    value={newApiKeyName}
                    onChange={(event) => setNewApiKeyName(event.target.value)}
                    placeholder="Ej. Claude Desktop"
                  />
                </label>
                <div className="api-key-kind-field">
                  <span>Tipo</span>
                  <div className="api-key-kind-toggle" role="group" aria-label="Tipo de API key">
                    {apiKeyKindOptions.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={`btn btn-ghost ${newApiKeyKind === kind ? "is-active" : ""}`.trim()}
                        aria-pressed={newApiKeyKind === kind}
                        disabled={apiKeysBusy}
                        onClick={() => setNewApiKeyKind(kind)}
                      >
                        {apiKeyKindLabels[kind]}
                      </button>
                    ))}
                  </div>
                  <span className="muted">{apiKeyKindDescriptions[newApiKeyKind]}</span>
                </div>
                <label>
                  Producto
                  <SearchableSelect
                    value={newApiKeyProductId}
                    onChange={setNewApiKeyProductId}
                    options={apiKeyProductOptions}
                    placeholder={availableProducts.length > 0 ? "Seleccionar producto" : "Sin productos disponibles"}
                    searchPlaceholder="Buscar producto..."
                    emptyMessage="No hay productos coincidentes."
                    ariaLabel="Seleccionar producto para la API key"
                    disabled={apiKeysBusy || availableProducts.length === 0}
                  />
                </label>
                {apiKeyRequiresStory ? (
                  <label>
                    Historia
                    <SearchableSelect
                      value={newApiKeyStoryId}
                      onChange={setNewApiKeyStoryId}
                      options={apiKeyStoryOptions}
                      placeholder={apiKeyStoriesLoading ? "Cargando historias" : "Seleccionar historia"}
                      searchPlaceholder="Buscar historia..."
                      emptyMessage="No hay historias disponibles."
                      ariaLabel="Seleccionar historia para reportes de incidentes"
                      disabled={apiKeysBusy || apiKeyStoriesLoading || apiKeyStoryOptions.length === 0}
                    />
                  </label>
                ) : null}
              </div>
              <div className="api-keys-form-footer">
                <p className="muted">La key se muestra una sola vez y despues queda listada abajo para administrarla.</p>
                <button
                  className="btn btn-primary"
                  disabled={!canCreateApiKey}
                  onClick={() => void (async () => {
                    setApiKeysBusy(true);
                    try {
                      const created = await auth.createApiKey({
                        name: newApiKeyName.trim(),
                        productId: newApiKeyProductId,
                        kind: newApiKeyKind,
                        storyId: apiKeyRequiresStory ? newApiKeyStoryId : undefined
                      });
                      setApiKeys((current) => [created.apiKey, ...current]);
                      setNewApiKeyCode(created.code);
                      setNewApiKeyCodeKind(created.apiKey.kind);
                      setNewApiKeyName("");
                      setNewApiKeyProductId((current) => current || availableProducts[0]?.id || "");
                      setApiKeysError("");
                    } catch (error) {
                      setApiKeysError(error instanceof Error ? error.message : "No se pudo crear la API key.");
                    } finally {
                      setApiKeysBusy(false);
                    }
                  })()}
                >
                  Crear key
                </button>
              </div>
            </div>
          </div>

          {newApiKeyCode ? (
            <div className="api-key-generated">
              <div>
                <span className="workspace-context">Codigo generado</span>
                <h4>Guardalo ahora</h4>
              </div>
              <code className="api-key-generated-code">{newApiKeyCode}</code>
              <p className="muted">
                Se muestra una sola vez. Usalo como header `x-api-key` al {
                  newApiKeyCodeKind === "INCIDENT_REPORT" ? "enviar POST /api/report." : "conectar el MCP."
                }
              </p>
            </div>
          ) : null}

          <div className="stack-lg api-keys-listing">
            <div className="api-keys-list-head">
              <div>
                <h4>Keys creadas</h4>
                <p className="muted">Revisa producto, mascara, actividad y elimina accesos que ya no necesites.</p>
              </div>
              <div className="api-keys-section-meta">
                <span className="api-keys-count">{apiKeysCountLabel}</span>
                <div className="api-keys-sort" role="group" aria-label="Ordenar API keys">
                  <button
                    type="button"
                    className={`btn btn-ghost ${apiKeysSortOrder === "newest" ? "is-active" : ""}`.trim()}
                    onClick={() => setApiKeysSortOrder("newest")}
                  >
                    Mas recientes
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost ${apiKeysSortOrder === "oldest" ? "is-active" : ""}`.trim()}
                    onClick={() => setApiKeysSortOrder("oldest")}
                  >
                    Mas antiguas
                  </button>
                </div>
              </div>
            </div>
            {apiKeysLoading ? <p className="muted">Cargando API keys...</p> : null}
            {!apiKeysLoading && availableProducts.length === 0 ? (
              <div className="definition-note api-keys-empty-state">
                <strong>No tenes productos accesibles para asociar nuevas API keys.</strong>
                <span className="muted">Cuando tengas acceso a un producto, vas a poder generar credenciales desde esta misma vista.</span>
              </div>
            ) : null}
            {!apiKeysLoading && apiKeys.length === 0 ? (
              <div className="definition-note api-keys-empty-state">
                <strong>Todavia no creaste ninguna API key.</strong>
                <span className="muted">Completa el formulario de arriba para generar tu primer acceso reutilizable.</span>
              </div>
            ) : null}
            {sortedApiKeys.length > 0 ? (
              <div className="api-key-table-shell">
                <table className="table api-key-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Tipo</th>
                      <th>Alcance</th>
                      <th>Creada</th>
                      <th>Ultimo uso</th>
                      <th>Estado</th>
                      <th aria-label="Acciones"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedApiKeys.map((apiKey) => (
                      <tr key={apiKey.id}>
                        <td className="api-key-primary-cell">
                          <div className="api-key-primary">
                            <strong>{apiKey.name}</strong>
                            <code>{apiKey.maskedCode}</code>
                          </div>
                        </td>
                        <td className="api-key-kind-cell">
                          <span className={`pill api-key-kind-pill is-${getApiKeyKindClass(apiKey.kind)}`.trim()}>
                            {apiKeyKindLabels[apiKey.kind]}
                          </span>
                        </td>
                        <td className="api-key-product-cell">
                          {apiKey.productKey && apiKey.productName ? (
                            <div className="api-key-product">
                              <span className="pill api-key-pill">{apiKey.productKey}</span>
                              <span>{apiKey.productName}</span>
                              {apiKey.kind === "INCIDENT_REPORT" ? (
                                <span className="api-key-story">{apiKey.storyTitle ?? "Sin historia asignada"}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="muted">Sin producto asignado</span>
                          )}
                        </td>
                        <td className="api-key-date-cell">
                          <strong>{new Date(apiKey.createdAt).toLocaleString()}</strong>
                        </td>
                        <td className="api-key-date-cell">
                          <strong>{apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : "Sin uso"}</strong>
                        </td>
                        <td className="api-key-state-cell">
                          <span className={`pill api-key-state-pill ${apiKey.lastUsedAt ? "is-used" : "is-idle"}`.trim()}>
                            {apiKey.lastUsedAt ? "Con uso" : "Sin uso"}
                          </span>
                        </td>
                        <td className="api-key-actions-cell">
                          <button
                            type="button"
                            className="btn btn-secondary sm"
                            disabled={apiKeysBusy}
                            onClick={() => void (async () => {
                              setApiKeysBusy(true);
                              try {
                                await auth.deleteApiKey(apiKey.id);
                                setApiKeys((current) => current.filter((entry) => entry.id !== apiKey.id));
                                setApiKeysError("");
                              } catch (error) {
                                setApiKeysError(error instanceof Error ? error.message : "No se pudo eliminar la API key.");
                              } finally {
                                setApiKeysBusy(false);
                              }
                            })()}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {apiKeysError ? <p className="error-text">{apiKeysError}</p> : null}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Mis metricas</h3>
            <p className="muted">Resumen personal de actividad, velocidad y continuidad de trabajo.</p>
          </div>
          <label className="settings-window-field">
            Ventana
            <SearchableSelect
              value={windowSize}
              onChange={(value) => setWindowSize(value as StatsWindow)}
              options={buildSearchableSelectOptions([...statsWindows])}
              ariaLabel="Ventana"
            />
          </label>
        </div>
        {stats ? (
          <div className="metrics-grid">
            <article className="metric"><h3>{stats.activityCount}</h3><p>Eventos</p></article>
            <article className="metric"><h3>{stats.activeDays}</h3><p>Dias activos</p></article>
            <article className="metric"><h3>{stats.tasksWorked}</h3><p>Tareas trabajadas</p></article>
            <article className="metric"><h3>{stats.averageVelocity.toFixed(2)}</h3><p>Velocidad promedio</p></article>
          </div>
        ) : null}
        {store.userVelocity.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Sprint</th>
                <th>Puntos completados</th>
              </tr>
            </thead>
            <tbody>
              {store.userVelocity.map((entry) => (
                <tr key={entry.sprintName}>
                  <td>{entry.sprintName}</td>
                  <td>{entry.completedPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {statsError ? <p className="error-text">{statsError}</p> : null}
      </section>
    </div>
  );
});
