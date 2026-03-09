import { useEffect, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

/**
 * Listens for Tauri drag-drop events and returns whether a file is currently
 * being dragged over the window. Calls `onDrop` with the first dropped path.
 */
export function useTauriDragDrop(
  enabled: boolean,
  onDrop: (filePath: string) => void,
): boolean {
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const fn = await getCurrentWebviewWindow().onDragDropEvent((event) => {
        const { type } = event.payload;
        if (type === 'enter') {
          setIsDragOver(true);
        } else if (type === 'leave') {
          setIsDragOver(false);
        } else if (type === 'drop') {
          setIsDragOver(false);
          const paths = (event.payload as { type: 'drop'; paths: string[] }).paths;
          if (paths.length > 0) onDrop(paths[0]);
        }
      });
      // If cleanup already ran before the async registration completed,
      // remove the listener immediately instead of keeping it alive.
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      setIsDragOver(false);
    };
  }, [enabled, onDrop]);

  return isDragOver;
}
