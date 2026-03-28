import React from "react";
import { ModalsController } from "../modals/ModalsController";
import { DrawerController } from "./DrawerController";

type DrawerCloseGuardOptions = {
  controller?: DrawerController;
  drawerId?: string;
  when: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function useDrawerCloseGuard(options: DrawerCloseGuardOptions) {
  const {
    controller,
    drawerId,
    when,
    title = "Descartar cambios",
    message = "Hay cambios sin guardar en este drawer. Si lo cierras ahora, se perderan.",
    confirmLabel = "Descartar cambios",
    cancelLabel = "Seguir editando"
  } = options;

  const guard = React.useCallback(async () => {
    if (!when) {
      return true;
    }

    return ModalsController.confirm({
      title,
      message,
      confirmLabel,
      cancelLabel,
      tone: "danger"
    });
  }, [cancelLabel, confirmLabel, message, title, when]);

  React.useEffect(() => {
    if (!controller || !drawerId) {
      return undefined;
    }

    controller.registerCloseGuard(drawerId, guard);
    return () => {
      controller.registerCloseGuard(drawerId, null);
    };
  }, [controller, drawerId, guard]);
}
