import { useRef, type MutableRefObject } from 'react';

export function useLazyRef<T>(createValue: () => T): MutableRefObject<T> {
  const valueRef = useRef<T | null>(null);

  if (valueRef.current === null) {
    valueRef.current = createValue();
  }

  return valueRef as MutableRefObject<T>;
}
