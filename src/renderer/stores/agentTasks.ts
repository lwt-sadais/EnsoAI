import type { AgentTask, AgentTaskStatus } from '@shared/types';
import { getPathBasename } from '@shared/utils/path';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { loadJSON, pathsEqual, saveJSON } from '@/App/storage';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from './agentSessions';
import { areAgentTaskRecordsEqual } from './agentTasksEquality';

const TASK_DESCRIPTIONS_STORAGE_KEY = 'enso-agent-task-descriptions';
const PANEL_POSITION_STORAGE_KEY = 'enso-agent-task-panel-position';
const PANEL_SIZE_STORAGE_KEY = 'enso-agent-task-panel-size';
const MAX_DESCRIPTION_LENGTH = 100;

function loadDescriptions(): Record<string, string> {
  return loadJSON<Record<string, string>>(TASK_DESCRIPTIONS_STORAGE_KEY) || {};
}

function saveDescriptions(descriptions: Record<string, string>) {
  saveJSON(TASK_DESCRIPTIONS_STORAGE_KEY, descriptions);
}

interface AgentTasksState {
  tasks: Record<string, AgentTask>;

  // Cached derived arrays (stable references)
  _allTasksCache: AgentTask[];
  _activeTasksCache: AgentTask[];
  _completedTasksCache: AgentTask[];
  _idleTasksCache: AgentTask[];
  _activeTaskCountCache: number;

  // Track start times per session
  startTimes: Record<string, number>;
  // Track completion times per session
  completionTimes: Record<string, number>;
  // Track waiting reasons per session
  waitingReasons: Record<string, string>;
  // Track descriptions per session (persisted)
  descriptions: Record<string, string>;
  // Agent task panel position (persisted)
  agentTaskPanelPosition: { x: number; y: number } | null;
  // Agent task panel size (persisted)
  agentTaskPanelSize: { width: number; height: number } | null;

  // Computed (return cached values)
  getAllTasks: () => AgentTask[];
  getActiveTasks: () => AgentTask[];
  getCompletedTasks: () => AgentTask[];
  getIdleTasks: () => AgentTask[];
  getActiveTaskCount: () => number;

  // Actions
  updateTaskStatus: (sessionId: string, status: AgentTaskStatus, reason?: string) => void;
  updateTaskDescription: (sessionId: string, description: string) => void;
  clearTask: (sessionId: string) => void;
  clearCompletedTasks: () => void;
  syncFromSessions: () => void;
  setAgentTaskPanelPosition: (position: { x: number; y: number } | null) => void;
  setAgentTaskPanelSize: (size: { width: number; height: number } | null) => void;
  resetAgentTaskPanel: () => void;
}

function computeDerivedArrays(tasks: Record<string, AgentTask>) {
  // Sort by start time only, tasks stay in place when status changes
  const all = Object.values(tasks).sort((a, b) => {
    return (b.startedAt || 0) - (a.startedAt || 0);
  });

  const active = all.filter(
    (t) => t.status === 'running' || t.status === 'waiting' || t.status === 'paused'
  );
  const completed = all.filter((t) => t.status === 'completed');
  const idle = all.filter((t) => t.status === 'idle');
  const activeTaskCount = all.filter((t) => t.status !== 'completed').length;

  return {
    _allTasksCache: all,
    _activeTasksCache: active,
    _completedTasksCache: completed,
    _idleTasksCache: idle,
    _activeTaskCountCache: activeTaskCount,
  };
}

export const useAgentTasksStore = create<AgentTasksState>()(
  subscribeWithSelector((set, get) => ({
    tasks: {},
    _allTasksCache: [],
    _activeTasksCache: [],
    _completedTasksCache: [],
    _idleTasksCache: [],
    _activeTaskCountCache: 0,
    startTimes: {},
    completionTimes: {},
    waitingReasons: {},
    descriptions: loadDescriptions(),
    agentTaskPanelPosition: loadJSON(PANEL_POSITION_STORAGE_KEY),
    agentTaskPanelSize: loadJSON(PANEL_SIZE_STORAGE_KEY),

    getAllTasks: () => get()._allTasksCache,
    getActiveTasks: () => get()._activeTasksCache,
    getCompletedTasks: () => get()._completedTasksCache,
    getIdleTasks: () => get()._idleTasksCache,
    getActiveTaskCount: () => get()._activeTaskCountCache,

    updateTaskStatus: (sessionId, status, reason) => {
      set((state) => {
        const task = state.tasks[sessionId];
        if (!task) return state;

        // Skip if status hasn't changed to avoid unnecessary re-renders
        if (task.status === status && (status !== 'waiting' || task.waitingReason === reason)) {
          return state;
        }

        const updates: Partial<AgentTask> = { status };

        if (status === 'running' && !state.startTimes[sessionId]) {
          updates.startedAt = Date.now();
        }

        if (status === 'completed') {
          updates.completedAt = Date.now();
        }

        if (status === 'waiting' && reason) {
          updates.waitingReason = reason;
        }

        if (status === 'idle') {
          updates.waitingReason = undefined;
        }

        const newTasks = {
          ...state.tasks,
          [sessionId]: { ...task, ...updates },
        };

        const newStartTimes =
          status === 'running' && !state.startTimes[sessionId]
            ? { ...state.startTimes, [sessionId]: Date.now() }
            : state.startTimes;

        const newCompletionTimes =
          status === 'completed'
            ? { ...state.completionTimes, [sessionId]: Date.now() }
            : state.completionTimes;

        const newWaitingReasons =
          status === 'waiting' && reason
            ? { ...state.waitingReasons, [sessionId]: reason }
            : status === 'idle'
              ? (() => {
                  const { [sessionId]: _, ...rest } = state.waitingReasons;
                  return rest;
                })()
              : state.waitingReasons;

        const derived = computeDerivedArrays(newTasks);

        // Notify main process to update badge count when a task completes
        if (status === 'completed') {
          const completedCount = derived._completedTasksCache.length;
          window.electronAPI.app.setBadgeCount(completedCount);
        }

        return {
          tasks: newTasks,
          startTimes: newStartTimes,
          completionTimes: newCompletionTimes,
          waitingReasons: newWaitingReasons,
          ...derived,
        };
      });
    },

    updateTaskDescription: (sessionId, description) => {
      set((state) => {
        const task = state.tasks[sessionId];
        if (!task) return state;

        const truncatedDesc =
          description.length > MAX_DESCRIPTION_LENGTH
            ? `${description.slice(0, MAX_DESCRIPTION_LENGTH)}…`
            : description;

        const newTasks = {
          ...state.tasks,
          [sessionId]: { ...task, description: truncatedDesc },
        };

        const newDescriptions = {
          ...state.descriptions,
          [sessionId]: truncatedDesc,
        };

        // Persist to localStorage
        saveDescriptions(newDescriptions);

        const derived = computeDerivedArrays(newTasks);
        return { tasks: newTasks, descriptions: newDescriptions, ...derived };
      });
    },

    clearTask: (sessionId) => {
      set((state) => {
        const task = state.tasks[sessionId];

        const { [sessionId]: _, ...restTasks } = state.tasks;
        const { [sessionId]: __, ...restStartTimes } = state.startTimes;
        const { [sessionId]: ___, ...restCompletionTimes } = state.completionTimes;
        const { [sessionId]: ____, ...restWaitingReasons } = state.waitingReasons;
        const { [sessionId]: _____, ...restDescriptions } = state.descriptions;
        saveDescriptions(restDescriptions);
        const derived = computeDerivedArrays(restTasks);

        // If the removed task was completed, decrement badge count
        if (task?.status === 'completed') {
          const completedCount = derived._completedTasksCache.length;
          window.electronAPI.app.setBadgeCount(completedCount);
        }

        return {
          tasks: restTasks,
          startTimes: restStartTimes,
          completionTimes: restCompletionTimes,
          waitingReasons: restWaitingReasons,
          descriptions: restDescriptions,
          ...derived,
        };
      });
    },

    clearCompletedTasks: () => {
      set((state) => {
        const completedIds = Object.values(state.tasks)
          .filter((t) => t.status === 'completed')
          .map((t) => t.sessionId);

        const newTasks = { ...state.tasks };
        const newStartTimes = { ...state.startTimes };
        const newCompletionTimes = { ...state.completionTimes };
        const newWaitingReasons = { ...state.waitingReasons };
        const newDescriptions = { ...state.descriptions };

        for (const id of completedIds) {
          delete newTasks[id];
          delete newStartTimes[id];
          delete newCompletionTimes[id];
          delete newWaitingReasons[id];
          delete newDescriptions[id];
        }

        saveDescriptions(newDescriptions);

        const derived = computeDerivedArrays(newTasks);

        // Reset badge count when completed tasks are cleared
        window.electronAPI.app.setBadgeCount(0);

        return {
          tasks: newTasks,
          startTimes: newStartTimes,
          completionTimes: newCompletionTimes,
          waitingReasons: newWaitingReasons,
          descriptions: newDescriptions,
          ...derived,
        };
      });
    },

    syncFromSessions: () => {
      const sessions = useAgentSessionsStore.getState().sessions;

      set((state) => {
        const newTasks: Record<string, AgentTask> = {};

        for (const session of sessions) {
          const existingTask = state.tasks[session.id];
          const startTime = state.startTimes[session.id];
          const completionTime = state.completionTimes[session.id];
          const waitingReason = state.waitingReasons[session.id];
          const persistedDescription = state.descriptions[session.id];

          // Preserve status from direct event handlers (PreToolUse, AskUserQuestion, Stop).
          // New tasks start as 'idle' until the first event arrives.
          const finalStatus = existingTask ? existingTask.status : 'idle';

          newTasks[session.id] = {
            sessionId: session.id,
            sessionName: session.name,
            repoPath: session.repoPath,
            repoName: getPathBasename(session.repoPath),
            cwd: session.cwd,
            status: finalStatus,
            description: persistedDescription || session.name,
            startedAt: startTime || existingTask?.startedAt || Date.now(),
            completedAt: completionTime || existingTask?.completedAt,
            waitingReason: waitingReason || existingTask?.waitingReason,
          };
        }

        if (areAgentTaskRecordsEqual(state.tasks, newTasks)) {
          return state;
        }

        const derived = computeDerivedArrays(newTasks);

        // Update badge if completed count changed (sessions added/removed)
        const prevCompletedCount = state._completedTasksCache.length;
        const newCompletedCount = derived._completedTasksCache.length;
        if (prevCompletedCount !== newCompletedCount) {
          window.electronAPI.app.setBadgeCount(newCompletedCount);
        }

        return { tasks: newTasks, ...derived };
      });
    },

    setAgentTaskPanelPosition: (position) => {
      saveJSON(PANEL_POSITION_STORAGE_KEY, position);
      set({ agentTaskPanelPosition: position });
    },

    setAgentTaskPanelSize: (size) => {
      saveJSON(PANEL_SIZE_STORAGE_KEY, size);
      set({ agentTaskPanelSize: size });
    },

    resetAgentTaskPanel: () => {
      saveJSON(PANEL_POSITION_STORAGE_KEY, null);
      saveJSON(PANEL_SIZE_STORAGE_KEY, null);
      set({ agentTaskPanelPosition: null, agentTaskPanelSize: null });
    },
  }))
);

function findSessionById(sessions: Session[], id: string) {
  return sessions.find((s) => s.sessionId === id || s.id === id);
}

function findSessionByNotification(
  sessions: Session[],
  sessionId: string,
  cwd?: string
): Session | undefined {
  const byId = findSessionById(sessions, sessionId);
  if (byId) return byId;

  if (cwd) {
    return sessions.find((s) => pathsEqual(s.cwd, cwd));
  }

  return undefined;
}

/**
 * Initialize agent tasks listener.
 * Subscribes to session changes and agent hook notifications to keep tasks in sync.
 * Call this once on app startup.
 */
export function initAgentTasksListener(): () => void {
  // Sync when sessions change
  const unsubSessions = useAgentSessionsStore.subscribe(
    (state) => state.sessions,
    () => {
      useAgentTasksStore.getState().syncFromSessions();
    }
  );

  // Listen for PreToolUse -> running
  const unsubPreToolUse = window.electronAPI.notification.onPreToolUse(
    (data: { sessionId: string; toolName: string; cwd?: string }) => {
      const session = findSessionByNotification(
        useAgentSessionsStore.getState().sessions,
        data.sessionId,
        data.cwd
      );
      if (session) {
        useAgentTasksStore.getState().updateTaskStatus(session.id, 'running');
      }
    }
  );

  // Listen for Stop -> completed
  const unsubStop = window.electronAPI.notification.onAgentStop(
    (data: { sessionId: string; cwd?: string }) => {
      const session = findSessionByNotification(
        useAgentSessionsStore.getState().sessions,
        data.sessionId,
        data.cwd
      );
      if (session) {
        useAgentTasksStore.getState().updateTaskStatus(session.id, 'completed');
      }
    }
  );

  // Listen for AskUserQuestion -> waiting
  const unsubAsk = window.electronAPI.notification.onAskUserQuestion(
    (data: { sessionId: string; toolInput: unknown; cwd?: string }) => {
      const session = findSessionByNotification(
        useAgentSessionsStore.getState().sessions,
        data.sessionId,
        data.cwd
      );
      if (session) {
        const reason =
          data.toolInput && typeof data.toolInput === 'string'
            ? extractWaitingReason(data.toolInput)
            : undefined;
        useAgentTasksStore.getState().updateTaskStatus(session.id, 'waiting', reason);
      }
    }
  );

  // Listen for UserPromptSubmit -> update description
  const unsubUserPrompt = window.electronAPI.notification.onUserPrompt(
    (data: { sessionId: string; prompt: string; cwd?: string }) => {
      const session = findSessionByNotification(
        useAgentSessionsStore.getState().sessions,
        data.sessionId,
        data.cwd
      );
      if (session && data.prompt) {
        useAgentTasksStore.getState().updateTaskDescription(session.id, data.prompt);
      }
    }
  );

  // Initial sync
  useAgentTasksStore.getState().syncFromSessions();

  // Push task changes to the standalone task panel window
  const unsubTaskSync = useAgentTasksStore.subscribe(
    (state) => state.tasks,
    (tasks) => {
      window.electronAPI.agentTaskPanel.sendTaskSync(tasks);
    }
  );

  return () => {
    unsubSessions();
    unsubPreToolUse();
    unsubStop();
    unsubAsk();
    unsubUserPrompt();
    unsubTaskSync();
  };
}

// Extract a brief waiting reason from tool input (e.g. AskUserQuestion JSON)
function extractWaitingReason(toolInput: string): string | undefined {
  try {
    const parsed = JSON.parse(toolInput);
    if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      const firstQuestion = parsed.questions[0];
      if (firstQuestion.question) {
        return firstQuestion.question.slice(0, MAX_DESCRIPTION_LENGTH);
      }
    }
    for (const value of Object.values(parsed)) {
      if (typeof value === 'string' && value.length > 0) {
        return value.slice(0, MAX_DESCRIPTION_LENGTH);
      }
    }
  } catch {
    if (toolInput.length > 0) {
      return toolInput.slice(0, MAX_DESCRIPTION_LENGTH);
    }
  }
  return undefined;
}

/**
 * Load a snapshot of tasks (used by the agent task panel window to initialize state).
 */
export function loadSnapshot(tasks: Record<string, AgentTask>): void {
  if (areAgentTaskRecordsEqual(useAgentTasksStore.getState().tasks, tasks)) {
    return;
  }

  const derived = computeDerivedArrays(tasks);
  useAgentTasksStore.setState({
    tasks,
    ...derived,
  });

  // Update badge to reflect snapshot state
  window.electronAPI.app.setBadgeCount(derived._completedTasksCache.length);
}

/**
 * Initialize agent task panel listeners for the standalone task panel window.
 * Only registers IPC notification listeners (no Zustand store subscriptions,
 * since the task panel window doesn't have sessions/activity stores).
 */
export function initAgentTaskPanelListeners(): () => void {
  // Listen for PreToolUse -> running
  const unsubPreToolUse = window.electronAPI.notification.onPreToolUse(
    (data: { sessionId: string; toolName: string; cwd?: string }) => {
      // In task panel window, match by sessionId directly
      const task = useAgentTasksStore.getState().tasks[data.sessionId];
      if (task) {
        useAgentTasksStore.getState().updateTaskStatus(data.sessionId, 'running');
      }
    }
  );

  // Listen for Stop -> completed
  const unsubStop = window.electronAPI.notification.onAgentStop(
    (data: { sessionId: string; cwd?: string }) => {
      const task = useAgentTasksStore.getState().tasks[data.sessionId];
      if (task) {
        useAgentTasksStore.getState().updateTaskStatus(data.sessionId, 'completed');
      }
    }
  );

  // Listen for AskUserQuestion -> waiting
  const unsubAsk = window.electronAPI.notification.onAskUserQuestion(
    (data: { sessionId: string; toolInput: unknown; cwd?: string }) => {
      const task = useAgentTasksStore.getState().tasks[data.sessionId];
      if (task) {
        const reason =
          data.toolInput && typeof data.toolInput === 'string'
            ? extractWaitingReason(data.toolInput)
            : undefined;
        useAgentTasksStore.getState().updateTaskStatus(data.sessionId, 'waiting', reason);
      }
    }
  );

  // Listen for UserPromptSubmit -> update description
  const unsubUserPrompt = window.electronAPI.notification.onUserPrompt(
    (data: { sessionId: string; prompt: string; cwd?: string }) => {
      const task = useAgentTasksStore.getState().tasks[data.sessionId];
      if (task && data.prompt) {
        useAgentTasksStore.getState().updateTaskDescription(data.sessionId, data.prompt);
      }
    }
  );

  // Listen for task sync from main window (covers add/remove/update)
  const unsubTaskSync = window.electronAPI.agentTaskPanel.onTaskSync(
    (tasks: Record<string, unknown>) => {
      loadSnapshot(tasks as Record<string, AgentTask>);
    }
  );

  return () => {
    unsubPreToolUse();
    unsubStop();
    unsubAsk();
    unsubUserPrompt();
    unsubTaskSync();
  };
}
