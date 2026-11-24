export const rerender = () => window.dispatchEvent(new Event('ql:rerender'));

/** Hash navigation. Re-renders even when the target equals the current hash (e.g. "refresh" after an action). */
export function navigate(path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
  const hash = `#${path}${qs ? `?${qs}` : ''}`;
  if (location.hash === hash) rerender();
  else location.hash = hash;
}
