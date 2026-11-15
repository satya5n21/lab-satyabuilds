import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Gemini Hydrogen's output, mounted untouched. Tailwind is loaded only on this page.
import App from '../../veyra_planet_of_the_living_light';
import './gemini.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
