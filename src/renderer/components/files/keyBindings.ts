import type { Monaco } from './monacoSetup';

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

// Key to Monaco KeyCode mapping
const KEY_MAP: Record<string, string> = {
  a: 'KeyA',
  b: 'KeyB',
  c: 'KeyC',
  d: 'KeyD',
  e: 'KeyE',
  f: 'KeyF',
  g: 'KeyG',
  h: 'KeyH',
  i: 'KeyI',
  j: 'KeyJ',
  k: 'KeyK',
  l: 'KeyL',
  m: 'KeyM',
  n: 'KeyN',
  o: 'KeyO',
  p: 'KeyP',
  q: 'KeyQ',
  r: 'KeyR',
  s: 'KeyS',
  t: 'KeyT',
  u: 'KeyU',
  v: 'KeyV',
  w: 'KeyW',
  x: 'KeyX',
  y: 'KeyY',
  z: 'KeyZ',
};

// Build Monaco keybinding from settings
export function buildMonacoKeybinding(m: Monaco, kb: KeyBinding): number {
  const keyName = KEY_MAP[kb.key.toLowerCase()] || 'KeyM';
  let keyCode = m.KeyCode[keyName as keyof typeof m.KeyCode] as number;

  // Apply modifiers
  if (kb.ctrl) keyCode |= m.KeyMod.CtrlCmd;
  if (kb.meta) keyCode |= m.KeyMod.CtrlCmd;
  if (kb.shift) keyCode |= m.KeyMod.Shift;
  if (kb.alt) keyCode |= m.KeyMod.Alt;

  return keyCode;
}
