import { useEffect, useCallback, useRef } from 'react';

type Handler = (data: unknown) => void;

export function useSSE(handlers: Record<string, Handler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const es = new EventSource('/api/events');

    const onMessage = (type: string) => (e: MessageEvent) => {
      const handler = handlersRef.current[type];
      if (handler) {
        try {
          handler(JSON.parse(e.data as string));
        } catch {
          handler(e.data);
        }
      }
    };

    const eventTypes = Object.keys(handlers);
    const listeners = eventTypes.map(type => {
      const listener = onMessage(type);
      es.addEventListener(type, listener);
      return { type, listener };
    });

    return () => {
      listeners.forEach(({ type, listener }) => es.removeEventListener(type, listener));
      es.close();
    };
  // handlers object identity changes every render — intentionally only run once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useReplanSSE(onReplan: () => void) {
  const cb = useCallback(onReplan, [onReplan]);
  useSSE({
    replan_triggered: cb,
    replan_completed: cb,
  });
}
