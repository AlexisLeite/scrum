import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink } from "react-router-dom";
import { ProductController } from "../../controllers";
import {
  productOverviewPath,
} from "../../routes/product-routes";
import { useRootStore } from "../../stores/root-store";
import { ProductUpsertionDrawer } from "../../ui/drawers/backoffice/ProductUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";

type ProductItem = { id: string; name: string; key: string; description: string | null };

export const ProductsBackofficeView = observer(function ProductsBackofficeView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const role = store.session.user?.role;
  const canManageProducts = role === "platform_admin" || role === "product_owner";

  React.useEffect(() => { void controller.loadProducts(); }, [controller]);
  const products = store.products.items as ProductItem[];

  const openCreate = React.useCallback(() => {
    store.drawers.add(
      new ProductUpsertionDrawer(controller, {
        onSaved: async () => { await controller.loadProducts(); }
      })
    );
  }, [controller, store.drawers]);

  const openEdit = React.useCallback((product: ProductItem) => {
    store.drawers.add(
      new ProductUpsertionDrawer(controller, {
        product,
        onSaved: async () => { await controller.loadProducts(); }
      })
    );
  }, [controller, store.drawers]);

  const removeProduct = React.useCallback(async (product: ProductItem) => {
    const confirmed = window.confirm(
      `Eliminar "${product.name}" borrara tambien historias, tareas y sprints asociados. Deseas continuar?`
    );
    if (!confirmed) return;
    await controller.deleteProduct(product.id);
    await controller.loadProducts();
  }, [controller]);

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="stack-h pb-4">
          <h3>Catalogo</h3>
          {canManageProducts ? <button className="btn btn-primary" onClick={openCreate}>+</button> : null}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Nombre</th>
              <th>Descripcion</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.key}</td>
                <td>{product.name}</td>
                <td><MarkdownPreview markdown={product.description} compact emptyLabel="-" /></td>
                <td>
                  <div className="row-actions compact">
                    <NavLink to={productOverviewPath(product.id)} className="btn btn-primary">Abrir workspace</NavLink>
                    {canManageProducts ? <button className="btn btn-secondary" onClick={() => openEdit(product)}>Editar</button> : null}
                    {canManageProducts ? <button className="btn btn-secondary" onClick={() => void removeProduct(product)}>Eliminar</button> : null}
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">No hay productos creados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
});
