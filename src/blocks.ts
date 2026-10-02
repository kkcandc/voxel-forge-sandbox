export const Block = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Log: 5,
  Leaves: 6,
  Water: 7,
  Snow: 8,
  Plank: 9,
  Glass: 10,
  Lumen: 11,
  Clay: 12,
  Cobble: 13,
  Core: 14,
  Pine: 15,
  Petal: 16,
  Tuft: 17,
  Spine: 18,
} as const;

export type BlockId = (typeof Block)[keyof typeof Block];

export const Tile = {
  GrassTop: 0,
  GrassSide: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  LogSide: 5,
  LogTop: 6,
  Leaves: 7,
  Water: 8,
  Snow: 9,
  Plank: 10,
  Glass: 11,
  Lumen: 12,
  Clay: 13,
  Cobble: 14,
  Core: 15,
  Pine: 16,
  Petal: 17,
  Tuft: 18,
  Spine: 19,
} as const;

export type BlockDef = {
  id: BlockId;
  name: string;
  /** Stops movement. */
  solid: boolean;
  /** Hides the face of a neighbor. */
  opaque: boolean;
  cutout: boolean;
  liquid: boolean;
  glow: boolean;
  glass: boolean;
  flora: boolean;
  unbreakable: boolean;
  color: number;
};

function def(
  id: BlockId,
  name: string,
  color: number,
  flags: Partial<Omit<BlockDef, "id" | "name" | "color">> = {},
): BlockDef {
  return {
    id,
    name,
    color,
    solid: false,
    opaque: false,
    cutout: false,
    liquid: false,
    glow: false,
    glass: false,
    flora: false,
    unbreakable: false,
    ...flags,
  };
}

export const BLOCKS: BlockDef[] = [
  def(Block.Air, "Air", 0x000000),
  def(Block.Grass, "Grass", 0x63b84d, { solid: true, opaque: true }),
  def(Block.Dirt, "Soil", 0x8d643c, { solid: true, opaque: true }),
  def(Block.Stone, "Stone", 0x8d9098, { solid: true, opaque: true }),
  def(Block.Sand, "Sand", 0xe4cc96, { solid: true, opaque: true }),
  def(Block.Log, "Timber", 0x6d4a2e, { solid: true, opaque: true }),
  def(Block.Leaves, "Foliage", 0x3e8f45, { cutout: true }),
  def(Block.Water, "Water", 0x3c86c4, { liquid: true }),
  def(Block.Snow, "Snow", 0xf2f6fb, { solid: true, opaque: true }),
  def(Block.Plank, "Boards", 0xc9a36a, { solid: true, opaque: true }),
  def(Block.Glass, "Pane", 0xd5eef6, { glass: true }),
  def(Block.Lumen, "Lumen", 0xffc14d, { solid: true, opaque: true, glow: true }),
  def(Block.Clay, "Clay", 0xc46b4a, { solid: true, opaque: true }),
  def(Block.Cobble, "Cobble", 0x6e7278, { solid: true, opaque: true }),
  def(Block.Core, "Corestone", 0x2a2830, { solid: true, opaque: true, unbreakable: true }),
  def(Block.Pine, "Pine", 0x2f6d58, { cutout: true }),
  def(Block.Petal, "Petal", 0xe888a4, { flora: true, cutout: true }),
  def(Block.Tuft, "Tuft", 0x7cb85a, { flora: true, cutout: true }),
  def(Block.Spine, "Spine", 0x4f9a48, { solid: true, opaque: true }),
];

export const PALETTE: BlockId[] = [
  Block.Grass,
  Block.Dirt,
  Block.Stone,
  Block.Sand,
  Block.Log,
  Block.Leaves,
  Block.Plank,
  Block.Glass,
  Block.Lumen,
  Block.Water,
];

export function faceTile(id: number, ny: number): number {
  switch (id) {
    case Block.Grass:
      if (ny > 0) return Tile.GrassTop;
      if (ny < 0) return Tile.Dirt;
      return Tile.GrassSide;
    case Block.Log:
      return ny !== 0 ? Tile.LogTop : Tile.LogSide;
    case Block.Dirt:
      return Tile.Dirt;
    case Block.Stone:
      return Tile.Stone;
    case Block.Sand:
      return Tile.Sand;
    case Block.Leaves:
      return Tile.Leaves;
    case Block.Water:
      return Tile.Water;
    case Block.Snow:
      return Tile.Snow;
    case Block.Plank:
      return Tile.Plank;
    case Block.Glass:
      return Tile.Glass;
    case Block.Lumen:
      return Tile.Lumen;
    case Block.Clay:
      return Tile.Clay;
    case Block.Cobble:
      return Tile.Cobble;
    case Block.Core:
      return Tile.Core;
    case Block.Pine:
      return Tile.Pine;
    case Block.Petal:
      return Tile.Petal;
    case Block.Tuft:
      return Tile.Tuft;
    case Block.Spine:
      return Tile.Spine;
    default:
      return Tile.Stone;
  }
}

export function iconTile(id: number): number {
  return faceTile(id, 1);
}

export function hidesFace(neighbor: number, self: number): boolean {
  if (neighbor === Block.Air) return false;
  const n = BLOCKS[neighbor];
  const s = BLOCKS[self];
  if (!n || !s) return false;
  if (n.opaque) return true;
  if (neighbor === self && (s.liquid || s.glass || s.cutout) && !s.flora) return true;
  return false;
}
