import { useCallback, useEffect, useState } from 'react';
import { useApp } from './store/useApp';
import { NavBar, type Route } from './components/ui';
import Intake from './screens/Intake';
import Review from './screens/Review';
import Diagnostic from './screens/Diagnostic';
import GraphHome from './screens/GraphHome';
import DeepDive from './screens/DeepDive';
import Report from './screens/Report';

const ROUTES: Route[] = ['intake', 'review', 'diagnostic', 'graph', 'deepdive', 'report'];
const read = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'intake';
};

export default function App() {
  const [route, setRoute] = useState<Route>(read());
  const { snap, draft, deep } = useApp();

  useEffect(() => {
    const f = () => setRoute(read());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = useCallback((r: Route) => {
    location.hash = `/${r}`;
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  // Guards: never render a screen whose data does not exist.
  let effective: Route = route;
  if (route === 'review' && !draft) effective = snap ? 'graph' : 'intake';
  if (['diagnostic', 'graph', 'report'].includes(route) && !snap) effective = draft ? 'review' : 'intake';
  if (route === 'deepdive' && (!snap || !deep)) effective = snap ? 'graph' : 'intake';

  return (
    <div className="min-h-full">
      <NavBar route={effective} go={go} />
      <main>
        {effective === 'intake' && <Intake go={go} />}
        {effective === 'review' && <Review go={go} />}
        {effective === 'diagnostic' && <Diagnostic go={go} />}
        {effective === 'graph' && <GraphHome go={go} />}
        {effective === 'deepdive' && <DeepDive go={go} />}
        {effective === 'report' && <Report go={go} />}
      </main>
    </div>
  );
}
