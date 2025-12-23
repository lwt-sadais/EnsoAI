export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  isMainWorktree: boolean;
  isLocked: boolean;
  prunable: boolean;
}

export interface WorktreeCreateOptions {
  path: string;
  branch?: string;
  newBranch?: string;
  checkout?: boolean;
}

export interface WorktreeRemoveOptions {
  path: string;
  force?: boolean;
  deleteBranch?: boolean;
  branch?: string;
}
