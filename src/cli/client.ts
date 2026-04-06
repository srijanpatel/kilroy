export class KilroyClient {
  private token?: string;

  constructor(private baseUrl: string, token?: string) {
    // Ensure baseUrl ends with / so new URL("api/...", baseUrl) resolves correctly
    if (!this.baseUrl.endsWith("/")) this.baseUrl += "/";
    this.token = token;
  }

  async createWorkspace(slug: string): Promise<any> {
    // POST /workspaces lives at the server root, not under a workspace path.
    // Strip any workspace slug from the base URL to get the root.
    const url = new URL(this.baseUrl);
    const rootUrl = url.origin;
    return this.request(`${rootUrl}/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
  }

  async browse(params: Record<string, string>): Promise<any> {
    return this.get("_/api/browse", params);
  }

  async readPost(id: string): Promise<any> {
    return this.get(`_/api/posts/${encodeURIComponent(id)}`);
  }

  async search(params: Record<string, string>): Promise<any> {
    return this.get("_/api/search", params);
  }

  async createPost(body: Record<string, any>): Promise<any> {
    return this.post("_/api/posts", body);
  }

  async createComment(postId: string, body: Record<string, any>): Promise<any> {
    return this.post(`_/api/posts/${encodeURIComponent(postId)}/comments`, body);
  }

  async updateStatus(postId: string, status: string): Promise<any> {
    return this.patch(`_/api/posts/${encodeURIComponent(postId)}`, { status });
  }

  async deletePost(postId: string): Promise<any> {
    return this.del(`_/api/posts/${encodeURIComponent(postId)}`);
  }

  async find(params: Record<string, string | string[]>): Promise<any> {
    // Handle array params (tags) by building URL manually
    const url = new URL("_/api/find", this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          url.searchParams.append(k, item);
        }
      } else if (v !== undefined && v !== "") {
        url.searchParams.set(k, v);
      }
    }
    return this.request(url.toString(), { method: "GET" });
  }

  async updatePost(postId: string, body: Record<string, any>): Promise<any> {
    return this.patch(`_/api/posts/${encodeURIComponent(postId)}`, body);
  }

  async updateComment(postId: string, commentId: string, body: Record<string, any>): Promise<any> {
    return this.patch(
      `_/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      body
    );
  }

  private async get(path: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      }
    }
    return this.request(url.toString(), { method: "GET" });
  }

  private async post(path: string, body: Record<string, any>): Promise<any> {
    const url = new URL(path, this.baseUrl);
    return this.request(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async patch(path: string, body: Record<string, any>): Promise<any> {
    const url = new URL(path, this.baseUrl);
    return this.request(url.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async del(path: string): Promise<any> {
    const url = new URL(path, this.baseUrl);
    return this.request(url.toString(), { method: "DELETE" });
  }

  private async request(url: string, init: RequestInit): Promise<any> {
    // Add auth header if token is configured
    if (this.token) {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${this.token}`);
      init = { ...init, headers };
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err: any) {
      if (err.code === "ECONNREFUSED" || err.message?.includes("fetch")) {
        console.error(`Error: Could not connect to Kilroy server at ${this.baseUrl}`);
        process.exit(3);
      }
      throw err;
    }

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) {
        console.error(`Error: ${data.error || "Not found"}`);
        process.exit(2);
      }
      console.error(`Error: ${data.error || `Server returned ${res.status}`}`);
      process.exit(1);
    }

    return data;
  }
}
