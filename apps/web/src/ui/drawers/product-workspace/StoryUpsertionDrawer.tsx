import React from "react";
import { ProductController } from "../../../controllers";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { ActivityTimeline } from "./ActivityTimeline";
import { RichDescriptionField } from "./RichDescriptionField";

type EditableStory = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
};

type StoryUpsertionDrawerOptions = {
  controller: ProductController;
  productId: string;
  story?: EditableStory;
  onDone?: () => Promise<void> | void;
};

const manualStoryStatuses: Array<"DRAFT" | "READY"> = ["DRAFT", "READY"];

export class StoryUpsertionDrawer extends Drawer {
  constructor(private readonly options: StoryUpsertionDrawerOptions) {
    super(options.story ? "Editar historia" : "Nueva historia", { size: "lg" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return <StoryUpsertionForm options={this.options} close={context.close} />;
  }
}

function StoryUpsertionForm(props: { options: StoryUpsertionDrawerOptions; close: () => void }) {
  const { options, close } = props;
  const { controller, productId, story, onDone } = options;
  const [title, setTitle] = React.useState(story?.title ?? "");
  const [description, setDescription] = React.useState(story?.description ?? "");
  const [storyPoints, setStoryPoints] = React.useState(String(story?.storyPoints ?? 3));
  const [status, setStatus] = React.useState<"DRAFT" | "READY">(
    story?.status === "READY" ? "READY" : "DRAFT"
  );
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        storyPoints: Number(storyPoints),
        status
      };

      if (story) {
        await controller.updateStory(story.id, payload);
      } else {
        await controller.createStory(productId, payload);
      }

      if (onDone) {
        await onDone();
      }
      close();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la historia.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-grid">
      <div className="form-grid two-columns">
        <label>
          Titulo
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Story points
          <input
            type="number"
            min={1}
            value={storyPoints}
            onChange={(event) => setStoryPoints(event.target.value)}
          />
        </label>
      </div>

      <label>
        Estado manual
        <select value={status} onChange={(event) => setStatus(event.target.value as "DRAFT" | "READY")}>
          {manualStoryStatuses.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <RichDescriptionField label="Descripcion" value={description} onChange={setDescription} />

      <div className="row-actions compact">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={saving || !title.trim()}
        >
          {story ? "Guardar historia" : "Crear historia"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
          Cancelar
        </button>
      </div>
      {story ? <ActivityTimeline controller={controller} entityType="stories" entityId={story.id} /> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
