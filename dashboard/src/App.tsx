import { Route, Routes } from 'react-router-dom';
import { Nav } from './components/Nav';
import Compare from './pages/Compare';
import Explorer from './pages/Explorer';
import Pivot from './pages/Pivot';
import Simulator from './pages/Simulator';
import Timeline from './pages/Timeline';

export default function App(): JSX.Element {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container-x pb-16 pt-8 md:pb-24 md:pt-12">
        <Routes>
          <Route path="/" element={<Explorer />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/pivot" element={<Pivot />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/timeline" element={<Timeline />} />
        </Routes>
      </main>
    </div>
  );
}
