import { RouterProvider } from '@tanstack/solid-router';

import './app.css';
import { router } from './router';

export default function App() {
  return <RouterProvider router={router} />;
}
