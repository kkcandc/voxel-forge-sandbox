import { BLOCKS, PALETTE, iconTile } from "./blocks";
import { iconURL } from "./textures";
import { setSlot, slot } from "./input";

export function dayLabel(t: number): string {
  const x = ((t % 1) + 1) % 1;
  if (x < 0.2 || x >= 0.8) return "Night";
  if (x < 0.27) return "Dawn";
  if (x < 0.4) return "Morning";
  if (x < 0.56) return "Noon";
  if (x < 0.66) return "Afternoon";
  if (x < 0.75) return "Golden hour";
  return "Dusk";
}

export function mountHud(atlas: HTMLCanvasElement): void {
  const bar = document.getElementById("hotbar");
  if (!bar) return;
  bar.innerHTML = "";
  PALETTE.forEach((id, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot";
    button.dataset.index = String(index);
    const key = index === 9 ? "0" : String(index + 1);
    button.innerHTML = `<img alt="" src="${iconURL(atlas, iconTile(id))}" /><span>${key}</span><em>${BLOCKS[id]?.name ?? ""}</em>`;
    button.addEventListener("click", () => setSlot(index));
    bar.appendChild(button);
  });
}

export function paintSlot(): void {
  document.querySelectorAll<HTMLButtonElement>("#hotbar .slot").forEach((button) => {
    button.classList.toggle("on", Number(button.dataset.index) === slot);
  });
  const name = BLOCKS[PALETTE[slot] ?? 0]?.name ?? "";
  const label = document.getElementById("held");
  if (label) label.textContent = name;
}

export function paintStatus(text: {
  seed: string;
  when: string;
  facing: string;
  place: string;
  fps: string;
  mode: string;
  load: number;
  dial: number;
  ready: boolean;
}): void {
  const seed = document.getElementById("seed");
  if (seed instanceof HTMLInputElement && document.activeElement !== seed) seed.value = text.seed;
  const when = document.getElementById("when");
  if (when) when.textContent = text.when;
  const facing = document.getElementById("facing");
  if (facing) facing.textContent = text.facing;
  const place = document.getElementById("place");
  if (place) place.textContent = text.place;
  const fps = document.getElementById("fps");
  if (fps) fps.textContent = text.fps;
  const mode = document.getElementById("mode");
  if (mode) {
    mode.textContent = text.mode;
    mode.classList.toggle("show", text.mode.length > 0);
  }
  const pip = document.getElementById("dial-pip");
  if (pip) pip.style.left = `${text.dial * 100}%`;
  const enter = document.getElementById("enter");
  if (enter instanceof HTMLButtonElement) {
    enter.disabled = !text.ready;
    if (!text.ready) enter.textContent = "Shaping the horizon…";
    else if (enter.textContent?.startsWith("Shaping")) enter.textContent = "Step in";
  }
  const prog = document.getElementById("prog");
  if (prog) prog.style.width = `${Math.round(text.load * 100)}%`;
}

export function setTarget(name: string): void {
  const el = document.getElementById("target");
  if (el) el.textContent = name;
}

export function setLookHint(visible: boolean): void {
  document.getElementById("look-hint")?.classList.toggle("show", visible);
}

export function showPlay(play: boolean): void {
  document.getElementById("veil")?.classList.toggle("hidden", play);
  document.getElementById("hud")?.classList.toggle("hidden", !play);
  document.body.classList.toggle("playing", play);
  document.getElementById("view")?.classList.add("ready");
}
