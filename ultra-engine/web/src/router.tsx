import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App';
import HomePage from './sections/home/HomePage';
import MePage from './sections/me/MePage';
import WorkPage from './sections/work/WorkPage';
import MoneyPage from './sections/money/MoneyPage';
import MovesPage from './sections/moves/MovesPage';
import WorldPage from './sections/world/WorldPage';
import UiKitPage from './sections/__uikit/UiKitPage';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'me/*', element: <MePage /> },
        { path: 'work/*', element: <WorkPage /> },
        { path: 'money', element: <MoneyPage /> },
        { path: 'moves/*', element: <MovesPage /> },
        { path: 'world', element: <WorldPage /> },
        { path: '__uikit', element: <UiKitPage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: '/app' },
);
