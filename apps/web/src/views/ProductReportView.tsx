import React from "react";
import { observer } from "mobx-react-lite";
import { FiSend } from "react-icons/fi";
import { useParams } from "react-router-dom";
import { ProductController } from "../controllers";
import { canReportProductIssue } from "../lib/permissions";
import { sessionCollectionScope, useRootStore } from "../stores/root-store";
import { getErrorMessage, ProductItem } from "./product-workspace/ProductWorkspaceViewShared";
import { RichDescriptionField } from "../ui/drawers/product-workspace/RichDescriptionField";

export const ProductReportView = observer(function ProductReportView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const user = store.session.user;
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const sessionScopeKey = sessionCollectionScope(user?.id);

  React.useEffect(() => {
    if (!user || !productId || !canReportProductIssue(user, productId)) {
      return;
    }
    void controller.loadProducts();
  }, [controller, productId, user]);

  if (!productId || !user) {
    return null;
  }

  if (!canReportProductIssue(user, productId)) {
    return (
      <section className="card page-state product-report-state">
        <h2>Sin acceso</h2>
        <p>No tienes permiso para reportar errores en este producto.</p>
      </section>
    );
  }

  const products = store.products.getItems(sessionScopeKey) as ProductItem[];
  const product = products.find((entry) => entry.id === productId);
  const canSubmit = title.trim().length >= 3 && body.trim().length > 0 && !submitting;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const result = await controller.createProductReport(productId, {
        title: title.trim(),
        body: body.trim()
      });
      setTitle("");
      setBody("");
      setSuccess(`Reporte recibido. Se creo la tarea ${result.taskId.slice(0, 8)}.`);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="product-report-page">
      <div className="product-report-header">
        <span className="focused-eyebrow">{product?.key ?? "Reporte"}</span>
        <h1>{product?.name ?? "Reportar error"}</h1>
      </div>

      <form className="product-report-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-grid">
          <label>
            Titulo
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              disabled={submitting}
              autoFocus
            />
          </label>
          <RichDescriptionField
            label="Detalle"
            value={body}
            onChange={setBody}
            rows={12}
            disabled={submitting}
            productId={productId}
            uriStateKey={`product-report:${productId}`}
          />
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}

        <div className="row-actions">
          <button className="btn btn-primary" type="submit" disabled={!canSubmit} aria-busy={submitting}>
            {submitting ? <span className="submit-loading-indicator" aria-hidden="true" /> : <FiSend aria-hidden="true" focusable="false" />}
            Enviar reporte
          </button>
        </div>
      </form>
    </section>
  );
});
