import { request } from "undici";
import type { WekanConfig } from "./config.js";
import type {
  WekanBoard,
  WekanCard,
  WekanChecklist,
  WekanComment,
  WekanList,
  WekanSwimlane,
  WekanUser,
} from "./types.js";

interface LoginResponse {
  id: string;
  token: string;
  tokenExpires?: string;
}

export interface WekanHttpResponse {
  statusCode: number;
  body: { text(): Promise<string> };
}

export interface WekanRequestOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  headersTimeout: number;
  bodyTimeout: number;
}

export type WekanTransport = (url: string, options: WekanRequestOptions) => Promise<WekanHttpResponse>;

const defaultTransport: WekanTransport = (url, options) => request(url, options);

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function responseDetail(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const detail = payload.error ?? payload.message;
  return detail === undefined ? fallback : String(detail);
}

export class WekanApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly method: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "WekanApiError";
  }
}

export class WekanClient {
  private sessionToken: string | undefined;
  private sessionTokenExpiresAt = 0;
  private currentUserCache: WekanUser | undefined;

  constructor(
    private readonly config: WekanConfig,
    private readonly transport: WekanTransport = defaultTransport,
  ) {}

  private async login(): Promise<string> {
    if (this.config.token) return this.config.token;
    if (this.sessionToken && Date.now() < this.sessionTokenExpiresAt - 60_000) {
      return this.sessionToken;
    }

    const response = await this.transport(`${this.config.baseUrl}/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
      }),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });
    const payload = await this.parseBody(response.body);
    if (response.statusCode >= 400) {
      throw new WekanApiError(
        `POST /users/login failed: ${responseDetail(payload, `HTTP ${response.statusCode}`)}`,
        response.statusCode,
        "POST",
        "/users/login",
      );
    }

    if (!isRecord(payload) || typeof payload.token !== "string" || !payload.token) {
      throw new Error("Wekan login response did not include a token");
    }
    const login = payload as unknown as LoginResponse;
    this.sessionToken = login.token;
    this.sessionTokenExpiresAt = login.tokenExpires
      ? new Date(login.tokenExpires).getTime()
      : Date.now() + 60 * 60 * 1000;
    return login.token;
  }

  private async parseBody(body: { text(): Promise<string> }): Promise<unknown> {
    const text = await body.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  async request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    const token = await this.login();
    const response = await this.transport(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });
    const payload = await this.parseBody(response.body);

    if (response.statusCode === 401 && retry && !this.config.token) {
      this.sessionToken = undefined;
      this.sessionTokenExpiresAt = 0;
      this.currentUserCache = undefined;
      return this.request<T>(method, path, body, false);
    }
    if (response.statusCode >= 400) {
      const detail = responseDetail(payload, `HTTP ${response.statusCode}`);
      throw new WekanApiError(`${method} ${path} failed: ${detail}`, response.statusCode, method, path);
    }
    return payload as T;
  }

  async currentUser(refresh = false): Promise<WekanUser> {
    if (!refresh && this.currentUserCache) return this.currentUserCache;
    this.currentUserCache = await this.request<WekanUser>("GET", "/api/user");
    return this.currentUserCache;
  }

  getBoard(boardId: string): Promise<WekanBoard> {
    return this.request("GET", `/api/boards/${pathSegment(boardId)}`);
  }

  async listBoards(): Promise<WekanBoard[]> {
    const user = await this.currentUser();
    const boardIds = (user.boards ?? []).filter((entry) => entry.isActive !== false).map((entry) => entry.boardId);
    return Promise.all(boardIds.map((boardId) => this.getBoard(boardId)));
  }

  listLists(boardId: string): Promise<WekanList[]> {
    return this.request("GET", `/api/boards/${pathSegment(boardId)}/lists`);
  }

  listSwimlanes(boardId: string): Promise<WekanSwimlane[]> {
    return this.request("GET", `/api/boards/${pathSegment(boardId)}/swimlanes`);
  }

  listCards(boardId: string, listId: string): Promise<WekanCard[]> {
    return this.request("GET", `/api/boards/${pathSegment(boardId)}/lists/${pathSegment(listId)}/cards`);
  }

  getCard(boardId: string, listId: string, cardId: string): Promise<WekanCard> {
    return this.request("GET", `/api/boards/${pathSegment(boardId)}/lists/${pathSegment(listId)}/cards/${pathSegment(cardId)}`);
  }

  async createCard(boardId: string, listId: string, body: Record<string, unknown>): Promise<WekanCard> {
    const user = await this.currentUser();
    let swimlaneId = body.swimlaneId;
    if (!swimlaneId) {
      const lanes = await this.listSwimlanes(boardId);
      swimlaneId = lanes[0]?._id;
    }
    if (!swimlaneId) throw new Error("The board has no swimlane; provide swimlaneId after creating one");

    if (body.parentId) {
      const results = await this.request<Array<{ index: number; _id?: string; error?: string }>>(
        "POST",
        `/api/boards/${pathSegment(boardId)}/lists/${pathSegment(listId)}/cards/bulk`,
        { cards: [{ ...body, swimlaneId }] },
      );
      const result = results[0];
      if (!result?._id) {
        throw new Error(`Wekan could not create subtask: ${result?.error ?? "empty bulk response"}`);
      }
      return { _id: result._id, title: String(body.title ?? ""), boardId, listId, swimlaneId: String(swimlaneId), parentId: String(body.parentId) };
    }

    return this.request("POST", `/api/boards/${pathSegment(boardId)}/lists/${pathSegment(listId)}/cards`, {
      ...body,
      authorId: user._id,
      swimlaneId,
    });
  }

  updateCard(boardId: string, fromListId: string, cardId: string, body: Record<string, unknown>): Promise<WekanCard> {
    return this.request("PUT", `/api/boards/${pathSegment(boardId)}/lists/${pathSegment(fromListId)}/cards/${pathSegment(cardId)}`, body);
  }

  deleteCard(boardId: string, listId: string, cardId: string): Promise<unknown> {
    return this.request("DELETE", `/api/boards/${pathSegment(boardId)}/lists/${pathSegment(listId)}/cards/${pathSegment(cardId)}`);
  }

  listComments(boardId: string, cardId: string): Promise<WekanComment[]> {
    return this.request("GET", `/api/boards/${pathSegment(boardId)}/cards/${pathSegment(cardId)}/comments`);
  }

  addComment(boardId: string, cardId: string, comment: string): Promise<{ _id: string }> {
    return this.request("POST", `/api/boards/${pathSegment(boardId)}/cards/${pathSegment(cardId)}/comments`, { comment });
  }

  listChecklists(boardId: string, cardId: string): Promise<WekanChecklist[]> {
    return this.request("GET", `/api/boards/${pathSegment(boardId)}/cards/${pathSegment(cardId)}/checklists`);
  }

  createChecklist(boardId: string, cardId: string, title: string): Promise<{ _id: string }> {
    return this.request("POST", `/api/boards/${pathSegment(boardId)}/cards/${pathSegment(cardId)}/checklists`, { title });
  }

  addChecklistItem(boardId: string, cardId: string, checklistId: string, title: string): Promise<{ _id: string }> {
    return this.request("POST", `/api/boards/${pathSegment(boardId)}/cards/${pathSegment(cardId)}/checklists/${pathSegment(checklistId)}/items`, { title });
  }

  updateChecklistItem(
    boardId: string,
    cardId: string,
    checklistId: string,
    itemId: string,
    body: { title?: string; isFinished?: boolean },
  ): Promise<{ _id: string }> {
    return this.request(
      "PUT",
      `/api/boards/${pathSegment(boardId)}/cards/${pathSegment(cardId)}/checklists/${pathSegment(checklistId)}/items/${pathSegment(itemId)}`,
      body,
    );
  }
}
