function getBase(team: string): string {
  return `/${team}/api`;
}

async function request(team: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${getBase(team)}${path}`, {
    credentials: 'include',
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export function browse(team: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(team, `/browse${qs ? `?${qs}` : ''}`);
}

export function readPost(team: string, id: string) {
  return request(team, `/posts/${encodeURIComponent(id)}`);
}

export function search(team: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return request(team, `/search?${qs}`);
}

export function createPost(team: string, body: Record<string, any>) {
  return request(team, '/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function createComment(team: string, postId: string, body: Record<string, any>) {
  return request(team, `/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateStatus(team: string, postId: string, status: string) {
  return request(team, `/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function deletePost(team: string, postId: string) {
  return request(team, `/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  });
}

export function getTeamInfo(team: string) {
  return request(team, '/info');
}

export function joinTeam(team: string, token: string) {
  return request(team, `/join?token=${encodeURIComponent(token)}`);
}
