import React from "react";
import { observer } from "mobx-react-lite";
import { DrawerController } from "./DrawerController";

export const DrawerHost = observer(function DrawerHost(props: { controller: DrawerController }) {
  const { controller } = props;
  const drawers = controller.stack;

  React.useEffect(() => {
    if (drawers.length === 0) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [drawers.length]);

  if (drawers.length === 0) return null;

  return (
    <div className="drawer-host" aria-live="polite">
      <div className="drawer-backdrop" onClick={() => controller.closeTop()} />
      {drawers.map((drawer, index) => (
        <aside key={drawer.id} className={`drawer-panel drawer-panel-${drawer.size} ${index === drawers.length - 1 ? "is-top" : "is-behind"}`} role="dialog" aria-modal="true" aria-label={drawer.title}>
          <header className="drawer-header">
            <h3>{drawer.title}</h3>
            <button type="button" className="btn btn-ghost" onClick={() => controller.close(drawer.id)}>Cerrar</button>
          </header>
          <div className="drawer-content">
            {drawer.render({
              controller,
              drawerId: drawer.id,
              close: () => controller.close(drawer.id)
            })}
          </div>
        </aside>
      ))}
    </div>
  );
});
