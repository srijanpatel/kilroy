import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LandingView } from './views/LandingView';
import { LoginView } from './views/LoginView';
import { OnboardingView } from './views/OnboardingView';
import { ProjectsView } from './views/ProjectsView';
import { ProjectShell } from './views/ProjectShell';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingView />} />
        <Route path="/login" element={<LoginView />} />
        <Route path="/onboarding" element={<OnboardingView />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/:account/:project/*" element={<ProjectShell />} />
      </Routes>
    </AuthProvider>
  );
}
