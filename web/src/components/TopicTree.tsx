import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { browse } from '../lib/api';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';

interface TopicData {
  subtopics: Array<{ name: string; post_count: number }>;
  posts: Array<{ id: string; title: string; topic: string; status: string }>;
}

interface TopicTreeProps {
  activePostId: string | null;
  onNavigate?: () => void;
}

export function TopicTree({ activePostId, onNavigate }: TopicTreeProps) {
  const workspace = useWorkspace();
  const wp = useWorkspacePath();
  const navigate = useNavigate();
  const location = useLocation();

  // Cache of fetched data per topic path ("" = root)
  const [cache, setCache] = useState<Map<string, TopicData>>(new Map());
  // Track which topics have been fetched (avoids stale closure on cache)
  const fetchedRef = useRef<Set<string>>(new Set());
  // Which topics are expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const stored = sessionStorage.getItem(`kilroy:tree:${workspace}`);
    return stored ? new Set(JSON.parse(stored)) : new Set<string>();
  });
  const [loading, setLoading] = useState<Set<string>>(new Set());

  // Reset cache when workspace changes
  useEffect(() => {
    fetchedRef.current = new Set();
    setCache(new Map());
  }, [workspace]);

  // Persist expanded state to sessionStorage
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

  // Fetch data for a topic path
  const fetchTopic = useCallback(async (topicPath: string) => {
    if (fetchedRef.current.has(topicPath)) return;
    fetchedRef.current.add(topicPath);
    setLoading((prev) => new Set(prev).add(topicPath));
    try {
      const params: Record<string, string> = {};
      if (topicPath) params.topic = topicPath;
      const data = await browse(workspace, params);
      setCache((prev) => {
        const next = new Map(prev);
        next.set(topicPath, {
          subtopics: data.subtopics || [],
          posts: (data.posts || []).map((p: any) => ({
            id: p.id,
            title: p.title,
            topic: p.topic,
            status: p.status,
          })),
        });
        return next;
      });
    } catch {
      // Allow retry on failure
      fetchedRef.current.delete(topicPath);
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(topicPath);
        return next;
      });
    }
  }, [workspace]);

  // Fetch root on mount
  useEffect(() => {
    fetchTopic('');
  }, [fetchTopic]);

  // Auto-expand path to current URL
  useEffect(() => {
    const topic = currentTopic;
    if (topic === null) return;
    if (!topic) return;
    const parts = topic.split('/');
    const paths: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
      paths.push(parts.slice(0, i).join('/'));
    }
    // Expand all ancestors and fetch their data
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.add(p);
      return next;
    });
    // Fetch data for each ancestor (no-ops if cached)
    for (const p of ['', ...paths]) {
      fetchTopic(p);
    }
  }, [currentTopic, workspace, fetchTopic]);

  // Auto-expand to active post's topic
  useEffect(() => {
    if (!activePostId) return;
    // Find the post in cache to get its topic
    for (const [, data] of cache) {
      const post = data.posts.find((p) => p.id === activePostId);
      if (post && post.topic) {
        const parts = post.topic.split('/');
        const paths: string[] = [];
        for (let i = 1; i <= parts.length; i++) {
          paths.push(parts.slice(0, i).join('/'));
        }
        setExpanded((prev) => {
          const next = new Set(prev);
          for (const p of paths) next.add(p);
          return next;
        });
        for (const p of ['', ...paths]) {
          fetchTopic(p);
        }
        break;
      }
    }
  }, [activePostId, cache, fetchTopic]);

  const toggleTopic = (topicPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topicPath)) {
        next.delete(topicPath);
      } else {
        next.add(topicPath);
        fetchTopic(topicPath);
      }
      return next;
    });
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const renderTopic = (parentPath: string, depth: number = 0) => {
    const data = cache.get(parentPath);
    if (!data) return null;

    return (
      <>
        {data.subtopics.map((st) => {
          const fullPath = parentPath ? `${parentPath}/${st.name}` : st.name;
          const isExpanded = expanded.has(fullPath);
          const isActive = currentTopic === fullPath;
          const isLoading = loading.has(fullPath);

          return (
            <div key={fullPath}>
              <div
                className={`tree-node ${isActive ? 'tree-node-active' : ''}`}
                style={{ paddingLeft: `${depth * 1 + 0.5}rem` }}
              >
                <span
                  className="tree-chevron"
                  onClick={(e) => { e.stopPropagation(); toggleTopic(fullPath); }}
                >
                  {isLoading ? '·' : isExpanded ? '▼' : '▶'}
                </span>
                <span
                  className="tree-topic-name"
                  onClick={() => handleNavigate(wp(`/${fullPath}/`))}
                >
                  {st.name}
                </span>
                <span className="tree-count">{st.post_count}</span>
              </div>
              {isExpanded && renderTopic(fullPath, depth + 1)}
            </div>
          );
        })}

        {data.posts.map((post) => {
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

  return <div>{renderTopic('')}</div>;
}
