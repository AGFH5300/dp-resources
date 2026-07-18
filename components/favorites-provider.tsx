'use client';
import React, { createContext, useContext, useMemo, useState } from 'react';
type Ctx = {
  saved: Set<string>;
  setSaved: (id: string, next: boolean) => void;
  isSaved: (id: string) => boolean;
};
const FavoriteContext = createContext<Ctx | null>(null);
export function FavoritesProvider({
  initialSavedIds,
  children,
}: {
  initialSavedIds: string[];
  children: React.ReactNode;
}) {
  const [ids, setIds] = useState(() => new Set(initialSavedIds));
  const value = useMemo(
    () => ({
      saved: ids,
      isSaved: (id: string) => ids.has(id),
      setSaved: (id: string, next: boolean) =>
        setIds((prev) => {
          const n = new Set(prev);
          next ? n.add(id) : n.delete(id);
          return n;
        }),
    }),
    [ids],
  );
  return (
    <FavoriteContext.Provider value={value}>
      {children}
    </FavoriteContext.Provider>
  );
}
export function useFavoriteState(id: string, initialSaved?: boolean) {
  const ctx = useContext(FavoriteContext);
  if (!ctx) {
    const [local, setLocal] = useState(Boolean(initialSaved));
    return {
      saved: local,
      setSaved: (_: string, next: boolean) => setLocal(next),
      hasProvider: false,
    };
  }
  return { saved: ctx.isSaved(id), setSaved: ctx.setSaved, hasProvider: true };
}
