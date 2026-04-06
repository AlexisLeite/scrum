import React from "react";
import { ActivityEntityType } from "@scrum/contracts";
import { apiClient } from "../../../api/client";
import { AdminController, ProductController, TeamController } from "../../../controllers";
import { InternalReference } from "../../../lib/internal-references";
import { useRootStore } from "../../../stores/root-store";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { ActivityFeed } from "../product-workspace/ActivityFeed";
import { ActivityTimeline } from "../product-workspace/ActivityTimeline";
import { MarkdownPreview } from "../product-workspace/MarkdownPreview";

type ProductItem = {
  id: string;
  name: string;
  key: string;
  description: string | null;
};

type StoryItem = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: string;
  productId: string;
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyId: string;
  sprintId: string | null;
  assigneeId: string | null;
  assignee?: { id: string; name: string; email: string } | null;
  story?: { id: string; title: string; storyPoints: number; status: string } | null;
  sprint?: { id: string; name: string; status: string } | null;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  teams?: Array<{ id: string; name: string }>;
};

type TeamItem = {
  id: string;
  name: string;
  members?: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
};

type ActivityEntry = React.ComponentProps<typeof ActivityFeed>["entries"][number];
type ActivityListResult = { items: ActivityEntry[]; page: number; pageSize: number; total: number };

export class InternalReferenceDrawer extends Drawer {
  constructor(private readonly reference: InternalReference) {
    super(resolveDrawerTitle(reference), { size: "md" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return <InternalReferencePanel reference={this.reference} close={context.close} />;
  }
}

function InternalReferencePanel(props: { reference: InternalReference; close: () => void }) {
  const { reference, close } = props;
  const store = useRootStore();
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const adminController = React.useMemo(() => new AdminController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);

  const [product, setProduct] = React.useState<ProductItem | null>(null);
  const [story, setStory] = React.useState<StoryItem | null>(null);
  const [task, setTask] = React.useState<TaskDetail | null>(null);
  const [user, setUser] = React.useState<UserItem | null>(null);
  const [userActivity, setUserActivity] = React.useState<ActivityEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setError("");
      try {
        if (reference.entityType === "PRODUCT") {
          await productController.loadProducts();
          if (!active) return;
          const matchedProduct = (store.products.items as ProductItem[]).find((entry) => entry.id === reference.entityId) ?? null;
          setProduct(matchedProduct);
          return;
        }

        if (reference.entityType === "STORY") {
          if (!reference.productId) {
            throw new Error("La referencia de historia no incluye producto.");
          }
          await productController.loadStories(reference.productId);
          if (!active) return;
          const matchedStory = (store.stories.items as StoryItem[]).find((entry) => entry.id === reference.entityId) ?? null;
          setStory(matchedStory);
          return;
        }

        if (reference.entityType === "TASK") {
          const detail = (await productController.loadTaskDetail(reference.entityId)) as TaskDetail;
          if (!active) return;
          setTask(detail);
          return;
        }

        try {
          await adminController.loadUsers();
        } catch {
          // Non-admin users may still resolve the reference through team membership below.
        }
        await teamController.loadTeams();
        if (!active) return;

        const cachedUser = (store.users.items as UserItem[]).find((entry) => entry.id === reference.entityId) ?? null;
        const teamDerivedUser = cachedUser ?? findUserInTeams(store.teams.items as TeamItem[], reference.entityId, reference.label);
        setUser(teamDerivedUser);

        try {
          const activityResponse = await apiClient.get<ActivityListResult>(`/activity/users/${reference.entityId}`);
          if (!active) return;
          setUserActivity(activityResponse.items);
        } catch {
          if (!active) return;
          setUserActivity([]);
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "No se pudo abrir la referencia interna.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    adminController,
    productController,
    reference.entityId,
    reference.entityType,
    reference.label,
    reference.productId,
    store.products.items,
    store.stories.items,
    store.teams.items,
    store.users.items,
    teamController
  ]);

  return (
    <div className="form-grid">
      {loading ? <p className="muted">Cargando referencia...</p> : null}
      {!loading && reference.entityType === "PRODUCT" ? <ProductReferenceCard controller={productController} product={product} /> : null}
      {!loading && reference.entityType === "STORY" ? <StoryReferenceCard controller={productController} story={story} /> : null}
      {!loading && reference.entityType === "TASK" ? <TaskReferenceCard controller={productController} task={task} /> : null}
      {!loading && reference.entityType === "USER" ? <UserReferenceCard user={user} activity={userActivity} fallbackLabel={reference.label} /> : null}
      {error ? <p className="error-text">{error}</p> : null}
      <div className="row-actions compact">
        <button type="button" className="btn btn-secondary" onClick={close}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function ProductReferenceCard(props: { controller: ProductController; product: ProductItem | null }) {
  const { controller, product } = props;
  if (!product) {
    return <p className="muted">No se encontro el producto referenciado.</p>;
  }

  return (
    <>
      <section className="card reference-entity-card">
        <div className="reference-entity-head">
          <span className="reference-entity-icon">P</span>
          <div>
            <p className="muted">Producto</p>
            <h4>{product.name}</h4>
            <span className="pill">{product.key}</span>
          </div>
        </div>
        <MarkdownPreview markdown={product.description} emptyLabel="Este producto no tiene descripcion." />
      </section>
      <ActivityTimeline controller={controller} entityType={"PRODUCT" as ActivityEntityType} entityId={product.id} />
    </>
  );
}

function StoryReferenceCard(props: { controller: ProductController; story: StoryItem | null }) {
  const { controller, story } = props;
  if (!story) {
    return <p className="muted">No se encontro la historia referenciada.</p>;
  }

  return (
    <>
      <section className="card reference-entity-card">
        <div className="reference-entity-head">
          <span className="reference-entity-icon">H</span>
          <div>
            <p className="muted">Historia</p>
            <h4>{story.title}</h4>
            <div className="row-actions compact">
              <span className="pill">SP {story.storyPoints}</span>
              <span className={`status status-${story.status.toLowerCase()}`}>{story.status}</span>
            </div>
          </div>
        </div>
        <MarkdownPreview markdown={story.description} emptyLabel="Esta historia no tiene descripcion." />
      </section>
      <ActivityTimeline controller={controller} entityType={"STORY" as ActivityEntityType} entityId={story.id} />
    </>
  );
}

function TaskReferenceCard(props: { controller: ProductController; task: TaskDetail | null }) {
  const { controller, task } = props;
  if (!task) {
    return <p className="muted">No se encontro la tarea referenciada.</p>;
  }

  return (
    <>
      <section className="card reference-entity-card">
        <div className="reference-entity-head">
          <span className="reference-entity-icon">T</span>
          <div>
            <p className="muted">Tarea</p>
            <h4>{task.title}</h4>
            <div className="row-actions compact">
              <span className={`status status-${task.status.toLowerCase().replace(/\s+/g, "-")}`}>{task.status}</span>
              <span className="pill">{task.story?.title ?? "Sin historia"}</span>
            </div>
          </div>
        </div>
        <div className="definition-context-grid">
          <div>
            <span className="muted">Sprint</span>
            <strong>{task.sprint?.name ?? "Backlog"}</strong>
          </div>
          <div>
            <span className="muted">Asignado</span>
            <strong>{task.assignee?.name ?? "Sin asignar"}</strong>
          </div>
        </div>
        <MarkdownPreview markdown={task.description} emptyLabel="Esta tarea no tiene descripcion." />
      </section>
      <ActivityTimeline controller={controller} entityType={"TASK" as ActivityEntityType} entityId={task.id} />
    </>
  );
}

function UserReferenceCard(props: {
  user: UserItem | null;
  activity: ActivityEntry[];
  fallbackLabel?: string;
}) {
  const { user, activity, fallbackLabel } = props;
  const displayName = user?.name ?? fallbackLabel ?? "Usuario";

  return (
    <>
      <section className="card reference-entity-card">
        <div className="reference-entity-head">
          <span className="reference-entity-icon">U</span>
          <div>
            <p className="muted">Usuario</p>
            <h4>{displayName}</h4>
            {user?.email ? <p className="muted">{user.email}</p> : null}
            {user?.role ? <span className={`status status-${user.role.toLowerCase()}`}>{user.role}</span> : null}
          </div>
        </div>
        <div className="definition-context-grid">
          <div>
            <span className="muted">Equipos</span>
            <strong>{user?.teams?.map((team) => team.name).join(", ") || "Sin datos"}</strong>
          </div>
        </div>
      </section>
      <section className="card">
        <h4>Actividad reciente</h4>
        {activity.length === 0 ? <p className="muted">No hay actividad visible para este usuario.</p> : <ActivityFeed entries={activity} />}
      </section>
    </>
  );
}

function findUserInTeams(teams: TeamItem[], userId: string, fallbackLabel?: string): UserItem | null {
  for (const team of teams) {
    const membership = (team.members ?? []).find((member) => member.userId === userId);
    if (!membership) {
      continue;
    }

    return {
      id: userId,
      name: membership.user?.name ?? fallbackLabel ?? userId,
      email: membership.user?.email ?? "",
      role: "",
      teams: [{ id: team.id, name: team.name }]
    };
  }

  if (!fallbackLabel) {
    return null;
  }

  return {
    id: userId,
    name: fallbackLabel,
    email: "",
    role: "",
    teams: []
  };
}

function resolveDrawerTitle(reference: InternalReference) {
  const label = reference.label?.trim();
  if (label) {
    return label;
  }
  if (reference.entityType === "PRODUCT") return "Producto";
  if (reference.entityType === "STORY") return "Historia";
  if (reference.entityType === "TASK") return "Tarea";
  return "Usuario";
}
