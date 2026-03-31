import { Routes, Route } from 'react-router-dom';
import { LandingView } from './views/LandingView';
import { TeamShell } from './views/TeamShell';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingView />} />
      <Route path="/:team/*" element={<TeamShell />} />
    </Routes>
  );
}
