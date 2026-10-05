interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Keep the phone layout at 1:2 and inside the current display's work area. */
export function getMiniWindowBounds(workArea: Bounds): Bounds {
  const height = Math.max(1, Math.floor(Math.min(840, workArea.height - 32, workArea.width * 2)));
  const width = Math.max(1, Math.floor(height / 2));
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}
