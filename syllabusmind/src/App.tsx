import { useCallback, useEffect, useState } from 'react';
import { useApp } from './store/useApp';
import { NavBar, type Route } from './components/ui';
import Intake from './screens/Intake';
import Diagnostic from './screens/Diagnostic';
import GraphHome from './screens/GraphHome';
import DeepDive from './screens/DeepDive';
import Report from './screens/Report';

const ROUTES: Route[] = ['intake', 'graph', 'diagnostic', 'deepdive', 'report'];
const read = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'intake';
};

export default function App() {
  const [route, setRoute] = useState<Route>(read());
  const { student, deep } = useApp();

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
  if (route !== 'intake' && !student) effective = 'intake';
  if (route === 'deepdive' && !deep) effective = student ? 'graph' : 'intake';

  return (
    <div className="min-h-full">
      <NavBar route={effective} go={go} />
      <main>
        {effective === 'intake' && <Intake go={go} />}
        {effective === 'graph' && <GraphHome go={go} />}
        {effective === 'diagnostic' && <Diagnostic go={go} />}
        {effective === 'deepdive' && <DeepDive go={go} />}
        {effective === 'report' && <Report go={go} />}
      </main>
    </div>
  );
}
