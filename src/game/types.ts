export type PlayerId = string;
export type RoleId = "lord" | "loyalist" | "rebel" | "renegade";
export type KingdomId = "wei" | "shu" | "wu" | "qun";
export type GameModeId = "duel" | "skirmish" | "identity";
export type GamePhase = "lobby" | "heroSelect" | "playing" | "finished";
export type TurnStage = "waiting" | "play" | "discard";
export type CardSuit = "spade" | "heart" | "club" | "diamond";
export type CardColor = "red" | "black";
export type CardType = "basic" | "trick" | "equip";
export type EquipmentSlot = "weapon" | "armor";
export type HeroSkillKind = "active" | "passive" | "conversion";
export type CardUseAs = "strike" | "dodge" | "peach";
export type GameEffectKind = "card" | "skill" | "response" | "damage" | "heal" | "equip";

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  kingdom: KingdomId;
  maxHp: number;
  skillName: string;
  skillKind: HeroSkillKind;
  skillText: string;
  quote: string;
}

export interface CardDef {
  key: string;
  name: string;
  type: CardType;
  description: string;
  target: "none" | "self" | "singleEnemy" | "singleAny" | "allOthers";
  count: number;
  equipmentSlot?: EquipmentSlot;
  range?: number;
}

export interface GameModeInfo {
  id: GameModeId;
  name: string;
  shortName: string;
  playerText: string;
  description: string;
  publicRoles: boolean;
  startingHand: number;
  firstTurnDraw: number;
  drawPerTurn: number;
  heroOptions: number;
  lordHeroOptions: number;
  lordHpBonus: boolean;
  roleLabels: Record<RoleId, string>;
  roleGoals: Record<RoleId, string>;
}

export interface GameCard {
  id: string;
  key: string;
  name: string;
  type: CardType;
  suit: CardSuit;
  color: CardColor;
  rank: string;
  description: string;
  target: CardDef["target"];
  equipmentSlot?: EquipmentSlot;
  range?: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  seat: number;
  online: boolean;
  isHost: boolean;
  role: RoleId | null;
  heroId: string | null;
  heroOptions: string[];
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: GameCard[];
  equipment: Partial<Record<EquipmentSlot, GameCard>>;
  strikesUsed: number;
  strikeDamageBonus: number;
  skillUsed: boolean;
  armorBlockedThisTurn: boolean;
  ready: boolean;
  joinedAt: number;
}

export interface LogEntry {
  id: string;
  time: number;
  text: string;
}

export interface DodgePending {
  kind: "dodge";
  sourceId: PlayerId;
  targetId: PlayerId;
  cardName: string;
  required: number;
  received: number;
  damage: number;
}

export interface DuelPending {
  kind: "duel";
  sourceId: PlayerId;
  targetId: PlayerId;
  currentResponderId: PlayerId;
  otherId: PlayerId;
}

export interface AoePending {
  kind: "aoe";
  sourceId: PlayerId;
  cardKey: "barbarian" | "arrows";
  response: "strike" | "dodge";
  targetIds: PlayerId[];
  index: number;
}

export interface DyingPending {
  kind: "dying";
  targetId: PlayerId;
  sourceId: PlayerId | null;
  needed: number;
  passedPlayerIds: PlayerId[];
  resume: ResumeAction;
}

export type PendingAction = DodgePending | DuelPending | AoePending | DyingPending;

export type ResumeAction =
  | { kind: "continuePlay" }
  | { kind: "continueAoe"; aoe: AoePending }
  | { kind: "endDuel" };

export interface GameEffect {
  id: string;
  kind: GameEffectKind;
  sourceId: PlayerId | null;
  targetId: PlayerId | null;
  title: string;
  text: string;
  at: number;
}

export interface GameState {
  roomCode: string;
  mode: GameModeId;
  phase: GamePhase;
  stage: TurnStage;
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  hostId: PlayerId | null;
  activePlayerId: PlayerId | null;
  pending: PendingAction | null;
  deck: GameCard[];
  discardPile: GameCard[];
  heroSelectEndsAt: number | null;
  actionDeadlineAt: number | null;
  latestEffect: GameEffect | null;
  turnNumber: number;
  startedAt: number | null;
  winner: string | null;
  finishReason: string | null;
  log: LogEntry[];
  seed: number;
}

export interface PublicPlayerView {
  id: PlayerId;
  name: string;
  seat: number;
  online: boolean;
  isHost: boolean;
  role: RoleId | null;
  heroId: string | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  handCount: number;
  equipment: Partial<Record<EquipmentSlot, GameCard>>;
  strikesUsed: number;
  strikeDamageBonus: number;
  skillUsed: boolean;
  armorBlockedThisTurn: boolean;
  ready: boolean;
}

export interface PlayerPrivateView extends PublicPlayerView {
  hand: GameCard[];
  heroOptions: string[];
}

export interface GameView {
  roomCode: string;
  mode: GameModeInfo;
  phase: GamePhase;
  stage: TurnStage;
  selfId: PlayerId;
  players: PublicPlayerView[];
  self: PlayerPrivateView;
  hostId: PlayerId | null;
  activePlayerId: PlayerId | null;
  pending: PendingAction | null;
  heroSelectEndsAt: number | null;
  actionDeadlineAt: number | null;
  serverNow: number;
  latestEffect: GameEffect | null;
  deckCount: number;
  discardCount: number;
  turnNumber: number;
  startedAt: number | null;
  winner: string | null;
  finishReason: string | null;
  log: LogEntry[];
}
