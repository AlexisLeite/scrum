import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink } from "react-router-dom";
import { ProductController } from "../../controllers";
import {
  canCreateProductsAdministration,
  canDeleteProductsAdministration,
  canUpdateProductsAdministration,
  canViewProductBacklog
} from "../../lib/permissions";
import {
  productOverviewPath,
} from "../../routes/product-routes";
import { useRootStore } from "../../stores/root-store";
import { ProductUpsertionDrawer } from "../../ui/drawers/backoffice/ProductUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";

type ProductItem = { id: string; name: string; key: string; description: string | null };

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export const ProductsBackofficeView = observer(function ProductsBackofficeView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const session = store.session.user;
  const canCreateProducts = canCreateProductsAdministration(session);
  const canEditProducts = canUpdateProductsAdministration(session);
  const canDeleteProducts = canDeleteProductsAdministration(session);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => { void controller.loadProducts(); }, [controller]);
  const products = store.products.items as ProductItem[];
  const filteredProducts = React.useMemo(() => {
    const query = normalizeText(search.trim());
    if (!query) {
      return products;
    }
    return products.filter((product) =>
      [product.key, product.name, product.description].some((value) => normalizeText(value).includes(query))
    );
  }, [products, search]);

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
          {canCreateProducts ? <button className="btn btn-primary" onClick={openCreate}>+</button> : null}
        </div>
        <label>
          Filtrar productos
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Key, nombre o descripcion"
          />
        </label>

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
            {filteredProducts.map((product) => (
              <tr key={product.id}>
                <td>{product.key}</td>
                <td>{product.name}</td>
                <td><MarkdownPreview markdown={product.description} compact emptyLabel="-" /></td>
                <td>
                  <div className="row-actions compact">
                    {canViewProductBacklog(session, product.id) ? (
                      <NavLink to={productOverviewPath(product.id)} className="btn btn-primary">Abrir workspace</NavLink>
                    ) : null}
                    {canEditProducts ? <button className="btn btn-secondary" onClick={() => openEdit(product)}>Editar</button> : null}
                    {canDeleteProducts ? <button className="btn btn-secondary" onClick={() => void removeProduct(product)}>Eliminar</button> : null}
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">No hay productos creados.</td>
              </tr>
            ) : null}
            {products.length > 0 && filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">No hay productos que coincidan con el filtro.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
});
