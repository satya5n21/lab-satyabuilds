import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);

// The compare view lives at <base>?compare so it works from any sub-path (and on a static host).
if (new URLSearchParams(location.search).has('compare')) {
  import('./compare/ComparePage').then(({ default: ComparePage }) => {
    root.render(
      <StrictMode>
        <ComparePage />
      </StrictMode>,
    );
  });
} else {
  Promise.all([import('./App'), import('./styles.css')]).then(([{ default: App }]) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
