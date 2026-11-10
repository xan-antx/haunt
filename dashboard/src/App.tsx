// Router and layout. Hash URLs, so deep links work on any static host.

import { RouterProvider, createHashRouter, type RouteObject } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { PATTERNS } from './routes';
import { CoverageScreen } from './screens/CoverageScreen';
import { ExorciseScreen } from './screens/ExorciseScreen';
import { GhostCamScreen, RunRedirect } from './screens/GhostCamScreen';
import { GraveyardScreen } from './screens/GraveyardScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { MapRedirect, SeanceRedirect } from './screens/redirects';
import { RestlessScreen } from './screens/RestlessScreen';
import { RouteErrorScreen } from './screens/RouteErrorScreen';

export const appRoutes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        // Error boundary inside the layout, so the header and navigation stay usable.
        errorElement: <RouteErrorScreen />,
        children: [
          { path: PATTERNS.home, element: <HomeScreen /> },
          { path: PATTERNS.graveyard, element: <GraveyardScreen /> },
          { path: PATTERNS.run, element: <RunRedirect /> },
          { path: PATTERNS.step, element: <GhostCamScreen /> },
          { path: PATTERNS.exorcise, element: <ExorciseScreen /> },
          { path: PATTERNS.exorcisePair, element: <ExorciseScreen /> },
          { path: PATTERNS.coverage, element: <CoverageScreen /> },
          // Old_Links (Req 6.10): they replace themselves with the place that holds their content now.
          { path: PATTERNS.map, element: <MapRedirect /> },
          { path: PATTERNS.seance, element: <SeanceRedirect /> },
          { path: PATTERNS.seanceAnswer, element: <SeanceRedirect /> },
          { path: PATTERNS.restless, element: <RestlessScreen /> },
          { path: '*', element: <NotFoundScreen /> },
        ],
      },
    ],
  },
];

const router = createHashRouter(appRoutes);

export function App() {
  return <RouterProvider router={router} />;
}
