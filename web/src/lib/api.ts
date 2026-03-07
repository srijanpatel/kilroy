const BASE = '/api';

async function request(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export function browse(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/browse${qs ? `?${qs}` : ''}`);
}

export function readPost(id: string) {
  return request(`/posts/${encodeURIComponent(id)}`);
}

export function search(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return request(`/search?${qs}`);
}

export function createPost(body: Record<string, any>) {
  return request('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function createComment(postId: string, body: Record<string, any>) {
  return request(`/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateStatus(postId: string, status: string) {
  return request(`/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function deletePost(postId: string) {
  return request(`/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  });
}
