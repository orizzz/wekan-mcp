export interface WekanBoard {
  _id: string;
  title: string;
  [key: string]: unknown;
}

export interface WekanList {
  _id: string;
  title: string;
  [key: string]: unknown;
}

export interface WekanSwimlane {
  _id: string;
  title: string;
  [key: string]: unknown;
}

export interface WekanCard {
  _id: string;
  title: string;
  description?: string;
  boardId?: string;
  listId?: string;
  swimlaneId?: string;
  parentId?: string;
  archived?: boolean;
  [key: string]: unknown;
}

export interface WekanUser {
  _id: string;
  username: string;
  boards?: Array<{ boardId: string; isActive?: boolean }>;
  [key: string]: unknown;
}

export interface WekanComment {
  _id: string;
  comment?: string;
  authorId?: string;
}

export interface WekanChecklist {
  _id: string;
  title: string;
  [key: string]: unknown;
}
