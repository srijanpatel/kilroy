function getBase(accountSlug: string, projectSlug: string): string {
  return `/${accountSlug}/${projectSlug}/api`;
}

async function request(accountSlug: string, projectSlug: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${getBase(accountSlug, projectSlug)}${path}`, {
    credentials: 'include',
    ...init,
  });
  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text();
  let data: any = null;

  if (raw) {
    if (contentType.includes('application/json')) {
      data = JSON.parse(raw);
    } else {
      try {
        data = JSON.parse(raw);
      } catch {
        if (res.status === 401) {
          window.location.href = '/login';
          throw new Error('Redirecting to login…');
        }
        throw new Error(`Expected JSON response but received ${contentType || 'non-JSON content'}`);
      }
    }
  }

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Redirecting to login…');
  }
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export function browse(accountSlug: string, projectSlug: string, params: Record<string, string> = {}, init?: RequestInit) {
  const qs = new URLSearchParams(params).toString();
  return request(accountSlug, projectSlug, `/browse${qs ? `?${qs}` : ''}`, init);
}

export function readPost(accountSlug: string, projectSlug: string, id: string) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(id)}`);
}

export function search(accountSlug: string, projectSlug: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return request(accountSlug, projectSlug, `/search?${qs}`);
}

export function createPost(accountSlug: string, projectSlug: string, body: Record<string, any>) {
  return request(accountSlug, projectSlug, '/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updatePost(accountSlug: string, projectSlug: string, postId: string, body: Record<string, any>) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function createComment(accountSlug: string, projectSlug: string, postId: string, body: Record<string, any>) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateStatus(accountSlug: string, projectSlug: string, postId: string, status: string) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function deletePost(accountSlug: string, projectSlug: string, postId: string) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  });
}

export function getProjectInfo(accountSlug: string, projectSlug: string) {
  return request(accountSlug, projectSlug, '/info');
}

export async function listMembers(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load members');
  return res.json();
}

export async function removeMemberApi(projectId: string, accountId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to remove member');
  return res.json();
}

export async function leaveProject(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/leave`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to leave project');
  return res.json();
}

export async function regenerateInviteLinkApi(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/regenerate-invite`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to regenerate invite link');
  return res.json();
}

export async function exportProject(accountSlug: string, projectSlug: string) {
  const res = await fetch(`${getBase(accountSlug, projectSlug)}/export`, {
    credentials: 'include',
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Redirecting to login…');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kilroy-export.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export async function regenerateKeyApi(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/regenerate-key`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to regenerate key');
  return res.json();
}
