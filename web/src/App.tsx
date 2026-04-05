import { Routes, Route } from 'react-router-dom';
import { LandingView } from './views/LandingView';
import { WorkspaceShell } from './views/WorkspaceShell';
import { StatsView } from './views/StatsView';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingView />} />
      <Route path="/_/pulse" element={<StatsView />} />
      <Route path="/:workspace/*" element={<WorkspaceShell />} />
    </Routes>
  );
}
