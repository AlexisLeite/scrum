import React from "react";
import { observer } from "mobx-react-lite";
import { useBodyScrollLock } from "../useBodyScrollLock";
import { useOverlayEscape } from "../useOverlayEscape";
import { DrawerController } from "./DrawerController";

export const DrawerHost = observer(function DrawerHost(props: { controller: DrawerController }) {
  const { controller } = props;
  const drawers = controller.stack;

  useBodyScrollLock(drawers.length > 0);

  useOverlayEscape(() => {
    void controller.requestCloseTop();
  }, drawers.length > 0);

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
