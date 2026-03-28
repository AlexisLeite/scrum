import React from "react";
import { observer } from "mobx-react-lite";
import { ModalsController } from "../modals/ModalsController";
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

  React.useEffect(() => {
    if (drawers.length === 0) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || ModalsController.hasOpenModals()) {
        return;
      }

      event.preventDefault();
      void controller.requestCloseTop();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [controller, drawers.length]);

  if (drawers.length === 0) return null;

  return (
    <div className="drawer-host" aria-live="polite">
      <div
        className="drawer-backdrop"
        onClick={() => {
          void controller.requestCloseTop();
        }}
      />
      {drawers.map((drawer, index) => (
        <aside key={drawer.id} className={`drawer-panel drawer-panel-${drawer.size} ${index === drawers.length - 1 ? "is-top" : "is-behind"}`} role="dialog" aria-modal="true" aria-label={drawer.title}>
          <header className="drawer-header">
            <h3>{drawer.title}</h3>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void controller.requestClose(drawer.id);
              }}
            >
              Cerrar
            </button>
          </header>
          <div className="drawer-content">
            {drawer.render({
              controller,
              drawerId: drawer.id,
              close: () => controller.close(drawer.id),
              requestClose: () => controller.requestClose(drawer.id),
              registerCloseGuard: (guard) => controller.registerCloseGuard(drawer.id, guard)
            })}
          </div>
        </aside>
      ))}
    </div>
  );
});
