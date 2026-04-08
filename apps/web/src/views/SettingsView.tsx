import React from "react";
import { observer } from "mobx-react-lite";
import { ApiKeyDto, ProductDto } from "@scrum/contracts";
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
  const [newApiKeyProductId, setNewApiKeyProductId] = React.useState("");
  const [newApiKeyCode, setNewApiKeyCode] = React.useState("");
  const [apiKeysBusy, setApiKeysBusy] = React.useState(false);
  const [availableProducts, setAvailableProducts] = React.useState<ProductDto[]>([]);

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
        <div className="section-head">
          <div>
            <h3>API keys</h3>
            <p className="muted">Cada key se asigna a un producto accesible y usa tu rol vigente sobre ese producto al autenticar el MCP por `x-api-key`.</p>
          </div>
        </div>
        <div className="definition-grid">
          <div className="form-grid">
            <label>
              Nombre
              <input
                value={newApiKeyName}
                onChange={(event) => setNewApiKeyName(event.target.value)}
                placeholder="Ej. Claude Desktop"
              />
            </label>
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
            <div className="row-actions">
              <button
                className="btn btn-primary"
                disabled={apiKeysBusy || newApiKeyName.trim().length < 2 || !newApiKeyProductId}
                onClick={() => void (async () => {
                  setApiKeysBusy(true);
                  try {
                    const created = await auth.createApiKey({
                      name: newApiKeyName.trim(),
                      productId: newApiKeyProductId
                    });
                    setApiKeys((current) => [created.apiKey, ...current]);
                    setNewApiKeyCode(created.code);
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
            {newApiKeyCode ? (
              <div className="definition-note api-key-card">
                <span className="muted">Codigo generado</span>
                <strong style={{ wordBreak: "break-all" }}>{newApiKeyCode}</strong>
                <span className="muted">Se muestra una sola vez. Usalo como header `x-api-key` al conectar el MCP.</span>
              </div>
            ) : null}
          </div>
          <div className="stack-lg api-keys-list">
            {apiKeysLoading ? <p className="muted">Cargando API keys...</p> : null}
            {!apiKeysLoading && availableProducts.length === 0 ? (
              <p className="muted">No tenes productos accesibles para asociar nuevas API keys.</p>
            ) : null}
            {!apiKeysLoading && apiKeys.length === 0 ? (
              <p className="muted">Todavia no creaste ninguna API key.</p>
            ) : null}
            {apiKeys.map((apiKey) => (
              <div key={apiKey.id} className="definition-note api-key-card">
                <span className="muted">{apiKey.name}</span>
                <strong>{apiKey.maskedCode}</strong>
                <span className="pill api-key-pill">
                  {apiKey.productKey && apiKey.productName ? `${apiKey.productKey} · ${apiKey.productName}` : "Sin producto asignado"}
                </span>
                <span className="muted">
                  Creada {new Date(apiKey.createdAt).toLocaleString()} · Ultimo uso {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : "sin uso"}
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
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
                </div>
              </div>
            ))}
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
