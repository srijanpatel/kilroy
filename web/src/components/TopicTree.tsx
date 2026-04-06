import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { browse } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';

interface Post {
  id: string;
  title: string;
  topic: string;
  status: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  totalPosts: number;
  posts: Post[];
  children: Map<string, TreeNode>;
}

interface TopicTreeProps {
  activePostId: string | null;
  onNavigate?: () => void;
}

function buildTree(posts: Post[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', totalPosts: 0, posts: [], children: new Map() };

  for (const post of posts) {
    const parts = post.topic ? post.topic.split('/') : [];
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          fullPath: parts.slice(0, i + 1).join('/'),
          totalPosts: 0,
          posts: [],
          children: new Map(),
        });
      }
      node = node.children.get(part)!;
    }

    node.posts.push(post);
  }

  // Compute totalPosts bottom-up
  function computeCounts(node: TreeNode): number {
    let count = node.posts.length;
    for (const child of node.children.values()) {
      count += computeCounts(child);
    }
    node.totalPosts = count;
    return count;
  }
  computeCounts(root);

  return root;
}

async function fetchAllPosts(workspace: string, signal?: AbortSignal): Promise<Post[]> {
  const allPosts: Post[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = { recursive: 'true', status: 'all', limit: '100' };
    if (cursor) params.cursor = cursor;
    const data = await browse(workspace, params, signal ? { signal } : undefined);

    for (const p of data.posts || []) {
      allPosts.push({ id: p.id, title: p.title, topic: p.topic || '', status: p.status });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return allPosts;
}

export function TopicTree({ activePostId, onNavigate }: TopicTreeProps) {
  const workspace = useWorkspace();
  const wp = useWorkspacePath();
  const navigate = useNavigate();
  const location = useLocation();
  const hasLoadedTreeRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);

  const [tree, setTree] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const stored = sessionStorage.getItem(`kilroy:tree:${workspace}`);
    return stored ? new Set(JSON.parse(stored)) : new Set<string>();
  });

  const loadTree = useCallback(() => {
    loadControllerRef.current?.abort();

    const controller = new AbortController();
    loadControllerRef.current = controller;

    fetchAllPosts(workspace, controller.signal)
      .then((posts) => {
        if (controller.signal.aborted) return;
        hasLoadedTreeRef.current = true;
        setError(null);
        setTree(buildTree(posts));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load topic tree:', err);
        setError(err instanceof Error ? err.message : 'Failed to load topic tree.');
      });
  }, [workspace]);

  // Fetch all posts on mount
  useEffect(() => {
    loadTree();
    return () => {
      loadControllerRef.current?.abort();
    };
  }, [loadTree]);

  // Re-fetch on navigation so create/edit redirects refresh the tree.
  useEffect(() => {
    if (!hasLoadedTreeRef.current) return;
    loadTree();
  }, [location.pathname, loadTree]);

  // Persist expanded state
  useEffect(() => {
    sessionStorage.setItem(`kilroy:tree:${workspace}`, JSON.stringify([...expanded]));
  }, [expanded, workspace]);

  // Derive current topic from URL
  const currentTopic = (() => {
    const wsPrefix = `/${workspace}/`;
    const path = location.pathname;
    if (path.includes('/post/') || path.includes('/search') || path.includes('/new')) return null;
    const after = path.startsWith(wsPrefix) ? path.slice(wsPrefix.length) : '';
    return after.replace(/\/$/, '');
  })();

  const visibleExpanded = useMemo(() => {
    const next = new Set(expanded);

    let targetTopic: string | null = currentTopic;
    if (!targetTopic && activePostId && tree) {
      const findPost = (node: TreeNode): string | null => {
        for (const p of node.posts) {
          if (p.id === activePostId) return node.fullPath;
        }
        for (const child of node.children.values()) {
          const found = findPost(child);
          if (found !== null) return found;
        }
        return null;
      };
      targetTopic = findPost(tree);
    }

    if (!targetTopic) return next;

    const parts = targetTopic.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      next.add(parts.slice(0, i).join('/'));
    }

    return next;
  }, [expanded, currentTopic, activePostId, tree]);

  const toggleTopic = (topicPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topicPath)) {
        next.delete(topicPath);
      } else {
        next.add(topicPath);
      }
      return next;
    });
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const sortedChildren = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));

    return (
      <>
        {sortedChildren.map((child) => {
          const isExpanded = visibleExpanded.has(child.fullPath);
          const isActive = currentTopic === child.fullPath;

          return (
            <div key={child.fullPath}>
              <div
                className={`tree-node ${isActive ? 'tree-node-active' : ''}`}
                style={{ paddingLeft: `${depth * 1 + 0.5}rem` }}
              >
                <span
                  className="tree-chevron"
                  onClick={(e) => { e.stopPropagation(); toggleTopic(child.fullPath); }}
                >
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span
                  className="tree-topic-name"
                  onClick={() => handleNavigate(wp(`/${child.fullPath}/`))}
                >
                  {child.name}
                </span>
                <span className="tree-count">{child.totalPosts}</span>
              </div>
              {isExpanded && renderNode(child, depth + 1)}
            </div>
          );
        })}

        {node.posts.map((post) => {
          const isActive = post.id === activePostId;
          return (
            <div
              key={post.id}
              className={`tree-node ${isActive ? 'tree-node-active' : ''}`}
              style={{ paddingLeft: `${depth * 1 + 0.5}rem` }}
              onClick={() => handleNavigate(wp(`/post/${post.id}`))}
            >
              <span className="tree-post-icon">📄</span>
              <span className="tree-post-name">{post.title}</span>
            </div>
          );
        })}
      </>
    );
  };

  if (!tree) {
    return (
      <div className="sidebar-tree-state">
        <div className="sidebar-tree-message">
          {error || 'Loading topics...'}
        </div>
        {error && (
          <button
            className="sidebar-tree-retry"
            type="button"
            onClick={() => {
              setError(null);
              loadTree();
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="sidebar-tree-notice" role="status">
          <span className="sidebar-tree-message">{error}</span>
          <button
            className="sidebar-tree-retry"
            type="button"
            onClick={() => {
              setError(null);
              loadTree();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {renderNode(tree)}
    </div>
  );
}
