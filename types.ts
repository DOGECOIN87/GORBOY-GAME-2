
export type TokenType = "COIN" | "GORBOY" | "CRYSTAL";

export interface Hud {
  wave: number;
  hp: number;
  shield: number;
  carried: Record<TokenType, number>;
  banked: Record<TokenType, number>;
  multiplier: number;
  dockNearby: boolean;
  dockHold: number;
  alive: boolean;
  invulnMs: number;
  dropsCount: number;
  info: string;
}

export interface Character {
  id: string;
  name: string;
  flavor: string;
  accent: string;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  radius: number;
  hp: number;
  shield: number;
  alive: boolean;
  invulnUntil: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
}

export interface Pickup {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: TokenType;
  amount: number;
  despawnAt: number;
  fromDeath: boolean;
}

export interface PowerUp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: "X2" | "X4" | "SHIELD";
  despawnAt: number;
}
