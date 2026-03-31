import React from "react";
import { ProductAssignableUserDto } from "@scrum/contracts";
import { ProductController } from "../controllers";
import { mergeAssignableUsers } from "../lib/assignable-users";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "No se pudieron cargar los usuarios asignables del producto.";
}

type AssignableUsersByProductId = Record<string, ProductAssignableUserDto[]>;

export function useProductAssignableUsers(controller: ProductController, productIds: string[]) {
  const normalizedProductIds = React.useMemo(
    () => Array.from(new Set(productIds.filter((productId) => productId && productId.trim().length > 0))),
    [productIds.join("\n")]
  );
  const [assignableUsersByProductId, setAssignableUsersByProductId] = React.useState<AssignableUsersByProductId>({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const reload = React.useCallback(async () => {
    if (normalizedProductIds.length === 0) {
      setAssignableUsersByProductId({});
      setError("");
      return {};
    }

    setLoading(true);
    try {
      const entries = await Promise.all(
        normalizedProductIds.map(async (productId) => [productId, await controller.loadAssignableUsers(productId)] as const)
      );
      const next = Object.fromEntries(entries);
      setAssignableUsersByProductId(next);
      setError("");
      return next;
    } catch (loadError) {
      setAssignableUsersByProductId({});
      setError(getErrorMessage(loadError));
      return {};
    } finally {
      setLoading(false);
    }
  }, [controller, normalizedProductIds]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const assignableUsers = React.useMemo(
    () => mergeAssignableUsers(...Object.values(assignableUsersByProductId)),
    [assignableUsersByProductId]
  );

  return {
    assignableUsers,
    assignableUsersByProductId,
    loading,
    error,
    reload
  };
}
