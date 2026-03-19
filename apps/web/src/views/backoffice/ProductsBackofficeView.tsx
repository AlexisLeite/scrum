import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink } from "react-router-dom";
import { ProductController } from "../../controllers";
import {
  productBacklogPath,
  productOverviewPath,
  productSprintsPath
} from "../../routes/product-routes";
import { useRootStore } from "../../stores/root-store";
import { ProductUpsertionDrawer } from "../../ui/drawers/backoffice/ProductUpsertionDrawer";

type ProductItem = { id: string; name: string; key: string; description: string | null };

export const ProductsBackofficeView = observer(function ProductsBackofficeView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);

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

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <h2>Gestion de productos</h2>
          <button className="btn btn-primary" onClick={openCreate}>+ Producto</button>
        </div>
      </section>
      <section className="card">
        <h3>Catalogo</h3>
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
                <td>{product.description ?? "-"}</td>
                <td>
                  <div className="row-actions compact">
                    <button className="btn btn-secondary" onClick={() => openEdit(product)}>Editar</button>
                    <NavLink to={productOverviewPath(product.id)} className="btn btn-secondary">Workspace</NavLink>
                    <NavLink to={productBacklogPath(product.id)} className="btn btn-secondary">Backlog</NavLink>
                    <NavLink to={productSprintsPath(product.id)} className="btn btn-secondary">Sprints</NavLink>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
});
