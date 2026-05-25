import { NavLink, Route, Routes } from 'react-router-dom';
import Compare from './pages/Compare';
import Explorer from './pages/Explorer';
import Simulator from './pages/Simulator';
import Timeline from './pages/Timeline';

export default function App(): JSX.Element {
  return (
    <>
      <header>
        <div className="project-title">Token Price Index</div>
        <nav aria-label="Primary navigation">
          <NavLink to="/" end>Explorer</NavLink>
          <NavLink to="/compare">Compare</NavLink>
          <NavLink to="/simulator">Simulator</NavLink>
          <NavLink to="/timeline">Timeline</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Explorer />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/timeline" element={<Timeline />} />
        </Routes>
      </main>
    </>
  );
}
