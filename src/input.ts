const keys = new Set<string>();
const edges = { fly: false, pause: false, respawn: false, noon: false, golden: false };
let lookX = 0;
let lookY = 0;
let touchForward = 0;
let touchRight = 0;
export let playing = false;
export let slot = 0;

export function setPlaying(value: boolean): void {
  playing = value;
  if (!value) keys.clear();
}

export function setSlot(index: number): void {
  slot = (index + 10) % 10;
}

export function keyHeld(code: string): boolean {
  return keys.has(code);
}

export function axisForward(): number {
  if (!playing) return 0;
  const keysAxis = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  return clamp(keysAxis + touchForward, -1, 1);
}

export function axisRight(): number {
  if (!playing) return 0;
  const keysAxis = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  return clamp(keysAxis + touchRight, -1, 1);
}

export function lookDelta(): { x: number; y: number } {
  const value = { x: lookX, y: lookY };
  lookX = 0;
  lookY = 0;
  return value;
}

export function consumeEdges(): { fly: boolean; pause: boolean; respawn: boolean; noon: boolean; golden: boolean } {
  const copy = { ...edges };
  edges.fly = false;
  edges.pause = false;
  edges.respawn = false;
  edges.noon = false;
  edges.golden = false;
  return copy;
}

export function bindInput(canvas: HTMLCanvasElement): void {
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (!playing && event.code !== "Enter") return;
    if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
    if (event.repeat) {
      keys.add(event.code);
      return;
    }
    keys.add(event.code);
    if (event.code === "KeyF") edges.fly = true;
    if (event.code === "KeyP") edges.pause = true;
    if (event.code === "KeyR") edges.respawn = true;
    if (event.code === "KeyN") edges.noon = true;
    if (event.code === "KeyM") edges.golden = true;
    if (event.code.startsWith("Digit")) {
      const n = Number(event.code.slice(5));
      if (n >= 1 && n <= 9) setSlot(n - 1);
      if (n === 0) setSlot(9);
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  window.addEventListener("blur", () => keys.clear());

  window.addEventListener(
    "wheel",
    (event) => {
      if (!playing) return;
      if (event.target instanceof HTMLInputElement) return;
      setSlot(slot + Math.sign(event.deltaY));
      event.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    lookX += event.movementX;
    lookY += event.movementY;
  });

  canvas.addEventListener("mousedown", (event) => {
    if (!playing) return;
    if (document.pointerLockElement !== canvas && !matchMedia("(pointer: coarse)").matches) {
      canvas.requestPointerLock();
    }
    if (event.button === 0) keys.add("mouse-break");
    if (event.button === 2) keys.add("mouse-place");
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) keys.delete("mouse-break");
    if (event.button === 2) keys.delete("mouse-place");
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  bindHold("btn-break", "mouse-break");
  bindHold("btn-place", "mouse-place");
  bindHold("btn-jump", "touch-jump");
  const fly = document.getElementById("btn-fly");
  fly?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    edges.fly = true;
  });

  bindStick("move-stick", (x, y) => {
    touchRight = x;
    touchForward = -y;
  });

  const look = document.getElementById("look-pad");
  if (look) {
    let id: number | null = null;
    let lastX = 0;
    let lastY = 0;
    look.addEventListener("pointerdown", (event) => {
      id = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      look.setPointerCapture(event.pointerId);
    });
    look.addEventListener("pointermove", (event) => {
      if (event.pointerId !== id) return;
      lookX += event.clientX - lastX;
      lookY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      id = null;
    };
    look.addEventListener("pointerup", end);
    look.addEventListener("pointercancel", end);
  }
}

export function breaking(): boolean {
  return playing && (keys.has("mouse-break") || keys.has("touch-break"));
}

export function placing(): boolean {
  return playing && keys.has("mouse-place");
}

function bindHold(id: string, code: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const down = (event: PointerEvent) => {
    event.preventDefault();
    keys.add(code);
    el.setPointerCapture(event.pointerId);
  };
  const up = () => keys.delete(code);
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
}

function bindStick(id: string, onChange: (x: number, y: number) => void): void {
  const el = document.getElementById(id);
  if (!el) return;
  let pointer: number | null = null;
  let originX = 0;
  let originY = 0;
  const knob = el.querySelector("i");
  el.addEventListener("pointerdown", (event) => {
    pointer = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    el.setPointerCapture(event.pointerId);
  });
  el.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointer) return;
    const x = clamp((event.clientX - originX) / 42, -1, 1);
    const y = clamp((event.clientY - originY) / 42, -1, 1);
    onChange(x, y);
    if (knob) knob.setAttribute("style", `transform: translate(${x * 18}px, ${y * 18}px)`);
  });
  const end = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    onChange(0, 0);
    if (knob) knob.removeAttribute("style");
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
