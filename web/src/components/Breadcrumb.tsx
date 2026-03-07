import { Link } from 'react-router-dom';

export function Breadcrumb({ topic }: { topic: string }) {
  if (!topic) return null;

  const parts = topic.split('/');
  return (
    <nav className="breadcrumb">
      <Link to="/">root</Link>
      {parts.map((part, i) => {
        const path = parts.slice(0, i + 1).join('/');
        return (
          <span key={path}>
            <span>/</span>
            <Link to={`/${path}/`}>{part}</Link>
          </span>
        );
      })}
      <span>/</span>
    </nav>
  );
}
