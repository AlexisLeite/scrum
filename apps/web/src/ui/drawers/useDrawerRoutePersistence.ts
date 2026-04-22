import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RootStore } from "../../stores/root-store";
import { openDrawerFromRouteDescriptor } from "./drawer-route-restoration";
import {
  DRAWER_ROUTE_PARAM,
  type DrawerRouteDescriptor,
  parseDrawerRouteDescriptors,
  serializeDrawerRouteDescriptors
} from "./drawer-route-state";

function descriptorKey(descriptor: DrawerRouteDescriptor) {
  return JSON.stringify(descriptor);
}

function commonDescriptorPrefixLength(current: DrawerRouteDescriptor[], target: DrawerRouteDescriptor[]) {
  const maxLength = Math.min(current.length, target.length);
  let index = 0;

  while (index < maxLength && descriptorKey(current[index]) === descriptorKey(target[index])) {
    index += 1;
  }

  return index;
}

export function useDrawerRoutePersistence(store: RootStore) {
  const location = useLocation();
  const navigate = useNavigate();
  const restoringRef = React.useRef(false);

  React.useEffect(() => {
    store.drawers.setRouteSyncListener((descriptors, mode) => {
      const nextParams = new URLSearchParams(location.search);
      const nextSerialized = serializeDrawerRouteDescriptors(descriptors);
      const shouldPreservePendingDrawerRoute = !store.session.hydrated
        && descriptors.length === 0
        && nextParams.has(DRAWER_ROUTE_PARAM);

      if (shouldPreservePendingDrawerRoute) {
        return;
      }

      if (nextSerialized) {
        nextParams.set(DRAWER_ROUTE_PARAM, nextSerialized);
      } else {
        nextParams.delete(DRAWER_ROUTE_PARAM);
      }

      const nextSearch = nextParams.toString();
      const currentSearch = location.search.startsWith("?") ? location.search.slice(1) : location.search;

      if (nextSearch === currentSearch) {
        return;
      }

      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: location.hash
        },
        { replace: mode !== "push" }
      );
    });

    return () => {
      store.drawers.setRouteSyncListener(null);
    };
  }, [location.hash, location.pathname, location.search, navigate, store.drawers, store.session.hydrated]);

  React.useEffect(() => {
    if (!store.session.hydrated || !store.session.user || restoringRef.current) {
      return undefined;
    }

    const targetDescriptors = parseDrawerRouteDescriptors(location.search);
    const currentDescriptors = store.drawers.getRouteDescriptors();
    const targetSignature = serializeDrawerRouteDescriptors(targetDescriptors);
    const currentSignature = serializeDrawerRouteDescriptors(currentDescriptors);

    if (targetSignature === currentSignature) {
      return undefined;
    }

    let cancelled = false;
    restoringRef.current = true;

    void (async () => {
      store.drawers.pauseRouteSync();

      try {
        const sharedPrefixLength = commonDescriptorPrefixLength(currentDescriptors, targetDescriptors);

        for (let index = store.drawers.stack.length - 1; index >= sharedPrefixLength; index -= 1) {
          if (cancelled) {
            return;
          }

          const drawer = store.drawers.stack[index];
          if (!drawer) {
            continue;
          }

          const closed = await store.drawers.requestClose(drawer.id);
          if (!closed) {
            return;
          }
        }

        const remainingDescriptors = targetDescriptors.slice(sharedPrefixLength);

        for (const descriptor of remainingDescriptors) {
          if (cancelled) {
            return;
          }

          await openDrawerFromRouteDescriptor(descriptor, {
            store,
            isCancelled: () => cancelled
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Drawer route restore failed", error);
        }
      } finally {
        store.drawers.resumeRouteSync();
        restoringRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      restoringRef.current = false;
    };
  }, [location.search, store, store.session.hydrated, store.session.user]);
}
