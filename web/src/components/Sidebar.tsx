import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { browse } from '../lib/api';

interface TopicNode {
  name: string;
  path: string;
  postCount: number;
  children: TopicNode[];
}

function buildTree(posts: any[]): TopicNode[] {
  const map = new Map<string, { count: number }>();

  for (const p of posts) {
    const parts = p.topic.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join('/');
      const existing = map.get(path);
      map.set(path, { count: (existing?.count || 0) + 1 });
    }
  }

  const nodes = new Map<string, TopicNode>();
  const roots: TopicNode[] = [];

  const sortedPaths = Array.from(map.keys()).sort();
  for (const path of sortedPaths) {
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const node: TopicNode = { name, path, postCount: map.get(path)!.count, children: [] };
    nodes.set(path, node);

    if (parts.length === 1) {
      roots.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = nodes.get(parentPath);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  return roots;
}

function TreeNode({ node, activeTopic }: { node: TopicNode; activeTopic: string }) {
  const navigate = useNavigate();
  const isActive = activeTopic === node.path;
  const isAncestor = activeTopic.startsWith(node.path + '/');
  const [expanded, setExpanded] = useState(isActive || isAncestor);

  useEffect(() => {
    if (isActive || isAncestor) setExpanded(true);
  }, [isActive, isAncestor]);

  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`tree-item ${isActive ? 'active' : ''}`}
        onClick={() => navigate(`/${node.path}/`)}
      >
        <span
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded(!expanded);
          }}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : ' '}
        </span>
        <span className="tree-label">{node.name}</span>
        <span className="tree-count">{node.postCount}</span>
      </div>
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} activeTopic={activeTopic} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ activeTopic }: { activeTopic: string }) {
  const [tree, setTree] = useState<TopicNode[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    browse({ recursive: 'true', status: 'all', limit: '100' })
      .then((data) => setTree(buildTree(data.posts || [])))
      .catch(() => {});
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-tree">
        {tree.map((node) => (
          <TreeNode key={node.path} node={node} activeTopic={activeTopic} />
        ))}
        {tree.length === 0 && (
          <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            No topics yet
          </div>
        )}
      </div>
      <div className="sidebar-bottom">
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/new')}>
          + New Post
        </button>
      </div>
    </aside>
  );
}
