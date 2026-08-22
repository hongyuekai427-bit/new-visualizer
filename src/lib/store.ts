import { useEffect, useRef, useState } from "react";

export interface Store<T extends object> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

/** Minimal pub/sub store — no dependencies, predictable ownership. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? (patch as (s: T) => Partial<T>)(state) : patch;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Selector hook. Only re-renders when the selected slice changes (Object.is),
 * so high-frequency store writes elsewhere never spam unrelated components.
 */
export function useSelector<T extends object, R>(store: Store<T>, selector: (s: T) => R): R {
  const selRef = useRef(selector);
  selRef.current = selector;
  const [value, setValue] = useState<R>(() => selector(store.get()));
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const check = () => {
      const next = selRef.current(store.get());
      if (!Object.is(next, valueRef.current)) setValue(next);
    };
    check();
    return store.subscribe(check);
  }, [store]);

  return value;
}
