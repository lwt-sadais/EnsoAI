import { is } from '@electron-toolkit/utils';
import { IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { autoUpdaterService } from '../services/updater/AutoUpdater';

let agentTaskPanelWindow: BrowserWindow | null = null;
let mainWindowRef: BrowserWindow | null = null;

const BOUNDS_FILE = join(app.getPath('userData'), 'agent-task-panel-bounds.json');

const DEFAULT_BOUNDS = {
  width: 500,
  height: 800,
  minWidth: 320,
  minHeight: 400,
};

function loadBounds(): Partial<Electron.Rectangle> {
  try {
    const fs = require('fs');
    if (fs.existsSync(BOUNDS_FILE)) {
      return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveBounds(bounds: Partial<Electron.Rectangle>): void {
  try {
    const fs = require('fs');
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds));
  } catch {
    // ignore
  }
}

// Calculate default position: below the trigger button, right-aligned with main window
function calcDefaultBounds(): Electron.Rectangle {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    return { x: 0, y: 0, width: DEFAULT_BOUNDS.width, height: DEFAULT_BOUNDS.height };
  }

  const mainBounds = mainWindowRef.getBounds();
  const panelWidth = DEFAULT_BOUNDS.width;
  const panelHeight = DEFAULT_BOUNDS.height;

  // Right-align with main window
  const x = mainBounds.x + mainBounds.width - panelWidth;
  // Below the title bar (h-12 = 48px)
  const y = mainBounds.y + 48;

  // Ensure panel stays within screen work area
  const display = screen.getDisplayMatching(mainBounds);
  const workArea = display.workArea;
  const clampedX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - panelWidth));
  const clampedY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - panelHeight));

  return { x: clampedX, y: clampedY, width: panelWidth, height: panelHeight };
}

export function createAgentTaskPanelWindow(): BrowserWindow {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    return agentTaskPanelWindow;
  }

  const savedBounds = loadBounds();

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds.width || DEFAULT_BOUNDS.width,
    height: savedBounds.height || DEFAULT_BOUNDS.height,
    minWidth: DEFAULT_BOUNDS.minWidth,
    minHeight: DEFAULT_BOUNDS.minHeight,
    x: savedBounds.x,
    y: savedBounds.y,
    show: false,
    title: 'Agent Tasks',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.frame = true;
  } else {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.frame = false;
  }

  agentTaskPanelWindow = new BrowserWindow(windowOptions);

  // Hide on close instead of destroying, and notify main window
  // Allow close when quitting for update to avoid blocking app exit
  agentTaskPanelWindow.on('close', (e) => {
    if (autoUpdaterService.isQuittingForUpdate()) {
      return;
    }
    e.preventDefault();
    agentTaskPanelWindow!.hide();
    // Notify main window that panel is no longer visible
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send(IPC_CHANNELS.AGENT_TASK_PANEL_VISIBILITY_CHANGED, false);
    }
  });

  // Persist bounds on move/resize
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedSaveBounds = (): void => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
        saveBounds(agentTaskPanelWindow.getBounds());
      }
    }, 500);
  };

  agentTaskPanelWindow.on('resize', debouncedSaveBounds);
  agentTaskPanelWindow.on('move', debouncedSaveBounds);

  // Load the agent task panel entry
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL']);
    url.pathname = '/agent-task-panel.html';
    agentTaskPanelWindow.loadURL(url.toString());
  } else {
    agentTaskPanelWindow.loadFile(join(__dirname, '../renderer/agent-task-panel.html'));
  }

  return agentTaskPanelWindow;
}

export function showAgentTaskPanelWindow(): BrowserWindow {
  const win = createAgentTaskPanelWindow();

  // If no saved position, calculate default position relative to main window
  const savedBounds = loadBounds();
  if (savedBounds.x === undefined || savedBounds.y === undefined) {
    win.setBounds(calcDefaultBounds());
  }

  win.show();
  win.focus();
  return win;
}

export function hideAgentTaskPanelWindow(): void {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    agentTaskPanelWindow.hide();
  }
}

export function destroyAgentTaskPanelWindow(): void {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    agentTaskPanelWindow.removeAllListeners('close');
    agentTaskPanelWindow.close();
  }
  agentTaskPanelWindow = null;
}

export function getAgentTaskPanelWindow(): BrowserWindow | null {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    return agentTaskPanelWindow;
  }
  return null;
}

export function isAgentTaskPanelVisible(): boolean {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    return agentTaskPanelWindow.isVisible();
  }
  return false;
}

export function resetAgentTaskPanelBounds(): void {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    agentTaskPanelWindow.setBounds(calcDefaultBounds());
  }
}

export function setMainWindowRef(ref: BrowserWindow): void {
  mainWindowRef = ref;
}
