import { Routes, Route } from 'react-router-dom';
import { LandingView } from './views/LandingView';
import { WorkspaceShell } from './views/WorkspaceShell';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingView />} />
      <Route path="/:workspace/*" element={<WorkspaceShell />} />
    </Routes>
  );
}
