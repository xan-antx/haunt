// Router and layout. Hash URLs, so deep links work on any static host.

import { RouterProvider, createHashRouter, type RouteObject } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { PATTERNS } from './routes';
import { CoverageScreen } from './screens/CoverageScreen';
import { ExorciseScreen } from './screens/ExorciseScreen';
import { GhostCamScreen, RunRedirect } from './screens/GhostCamScreen';
import { GraveyardScreen } from './screens/GraveyardScreen';
import { HauntedMapScreen } from './screens/HauntedMapScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { RestlessScreen } from './screens/RestlessScreen';
import { RouteErrorScreen } from './screens/RouteErrorScreen';
import { SeanceScreen } from './screens/SeanceScreen';

export const appRoutes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        // Error boundary inside the layout, so the header and navigation stay usable.
        errorElement: <RouteErrorScreen />,
        children: [
          { path: PATTERNS.home, element: <HomeScreen /> },
          { path: PATTERNS.map, element: <HauntedMapScreen /> },
          { path: PATTERNS.graveyard, element: <GraveyardScreen /> },
          { path: PATTERNS.run, element: <RunRedirect /> },
          { path: PATTERNS.step, element: <GhostCamScreen /> },
          { path: PATTERNS.seance, element: <SeanceScreen /> },
          { path: PATTERNS.seanceAnswer, element: <SeanceScreen /> },
          { path: PATTERNS.exorcise, element: <ExorciseScreen /> },
          { path: PATTERNS.exorcisePair, element: <ExorciseScreen /> },
          { path: PATTERNS.coverage, element: <CoverageScreen /> },
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
