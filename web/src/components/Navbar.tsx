import { ThemeToggle } from './ThemeToggle';
import { AccountMenu } from './AccountMenu';

interface NavbarProps {
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Navbar({ children, actions }: NavbarProps) {
  return (
    <div className="omnibar-row">
      {children}
      <div className="navbar-actions">
        {actions}
        <ThemeToggle />
        <AccountMenu />
      </div>
    </div>
  );
}
