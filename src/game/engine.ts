import { CARDS, GAME_MODES, HEROES, ROLE_SETS, getCardDef, getHero, getModeForPlayerCount, getRoleLabel } from "./content";
import type {
  AoePending,
  CardUseAs,
  CardColor,
  CardSuit,
  EquipmentSlot,
  GameCard,
  GameState,
  GameView,
  PendingAction,
  PlayerId,
  PlayerState,
  PublicPlayerView,
  ResumeAction,
  RoleId
} from "./types";

const SUITS: CardSuit[] = ["spade", "heart", "club", "diamond"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const MAX_LOG = 80;

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

export function createGame(roomCode: string): GameState {
  return {
    roomCode,
    mode: "identity",
    phase: "lobby",
    stage: "waiting",
    players: {},
    playerOrder: [],
    hostId: null,
    activePlayerId: null,
    pending: null,
    deck: [],
    discardPile: [],
    turnNumber: 0,
    startedAt: null,
    winner: null,
    finishReason: null,
    log: [],
    seed: Date.now() % 2_147_483_647
  };
}

export function addOrReconnectPlayer(game: GameState, playerId: PlayerId, name: string) {
  const existing = game.players[playerId];
  if (existing) {
    existing.name = cleanName(name);
    existing.online = true;
    return existing;
  }

  assert(game.phase === "lobby", "牌局已经开始，只能用原浏览器重连。");
  assert(game.playerOrder.length < 8, "房间已满，最多 8 人。");

  const player: PlayerState = {
    id: playerId,
    name: cleanName(name),
    seat: game.playerOrder.length,
    online: true,
    isHost: game.hostId === null,
    role: null,
    heroId: null,
    heroOptions: [],
    hp: 0,
    maxHp: 0,
    alive: true,
    hand: [],
    equipment: {},
    strikesUsed: 0,
    skillUsed: false,
    armorBlockedThisTurn: false,
    ready: false,
    joinedAt: Date.now()
  };

  game.players[playerId] = player;
  game.playerOrder.push(playerId);
  if (!game.hostId) {
    game.hostId = playerId;
    player.isHost = true;
  }
  if (game.phase === "lobby") {
    game.mode = getModeForPlayerCount(game.playerOrder.length).id;
  }
  addLog(game, `${player.name} 入座。`);
  return player;
}

export function markPlayerOffline(game: GameState, playerId: PlayerId) {
  const player = game.players[playerId];
  if (!player) return;
  player.online = false;
  addLog(game, `${player.name} 暂时离线。`);
}

export function startHeroSelect(game: GameState, playerId: PlayerId) {
  assert(game.phase === "lobby", "只有大厅阶段可以开始。");
  assert(game.hostId === playerId, "只有房主可以开始牌局。");
  const playerCount = game.playerOrder.length;
  assert(playerCount >= 2, "至少需要 2 名玩家。");
  assert(playerCount <= 8, "最多支持 8 名玩家。");
  const mode = getModeForPlayerCount(playerCount);
  game.mode = mode.id;

  // 身份配置参考身份局结构。2 人对战不随机身份，房主默认主将，朋友默认挑战者，方便直接开打。
  const roles = mode.id === "duel" ? [...ROLE_SETS[playerCount]] : shuffle(game, [...ROLE_SETS[playerCount]]);
  const heroPool = shuffle(
    game,
    HEROES.map((hero) => hero.id)
  );

  game.playerOrder.forEach((id, index) => {
    const player = game.players[id];
    player.role = roles[index];
    player.heroId = null;
    // 当前武将池较小，候选允许跨玩家重复；同一名玩家看到的候选仍保持不重复。
    player.heroOptions = dealHeroOptions(heroPool, index, roles[index] === "lord" ? mode.lordHeroOptions : mode.heroOptions);
    player.hand = [];
    player.equipment = {};
    player.hp = 0;
    player.maxHp = 0;
    player.alive = true;
    player.strikesUsed = 0;
    player.skillUsed = false;
    player.armorBlockedThisTurn = false;
    player.ready = false;
  });

  game.phase = "heroSelect";
  game.stage = "waiting";
  game.pending = null;
  game.deck = [];
  game.discardPile = [];
  game.turnNumber = 0;
  game.startedAt = null;
  game.winner = null;
  game.finishReason = null;

  const lord = getLord(game);
  addLog(game, `${mode.name}已就绪，${lord?.name ?? "某位玩家"} 是${getRoleLabel("lord", mode.id)}。请选择武将。`);
}

export function chooseHero(game: GameState, playerId: PlayerId, heroId: string) {
  assert(game.phase === "heroSelect", "当前不能选择武将。");
  const player = requirePlayer(game, playerId);
  assert(player.heroOptions.includes(heroId), "只能选择发给你的武将。");
  player.heroId = heroId;
  player.ready = true;
  addLog(game, `${player.name} 选择了武将。`);

  if (game.playerOrder.every((id) => game.players[id].heroId)) {
    startPlaying(game);
  }
}

export function playCard(game: GameState, playerId: PlayerId, cardId: string, targetId?: PlayerId) {
  assertCanActInPlayStage(game, playerId);
  const player = requirePlayer(game, playerId);
  const card = requireHandCard(player, cardId);

  // 普通出牌只按牌面原本含义结算。转换技必须走 playCardAs，避免红色锦囊被关羽误当【杀】。
  if (card.key === "strike") {
    assert(typeof targetId === "string" && targetId.length > 0, "使用【杀】需要选择目标。");
    playStrike(game, player, card, targetId);
    return;
  }

  if (card.key === "peach") {
    assert(!targetId || targetId === playerId, "【桃】只能给自己使用。");
    assert(player.hp < player.maxHp, "体力已满，不需要使用【桃】。");
    removeCardsFromHand(player, [card.id]);
    discardCards(game, [card]);
    healPlayer(game, player.id, 1, `${player.name} 使用【桃】回复 1 点体力。`);
    return;
  }

  switch (card.key) {
    case "draw_two":
      removeCardsFromHand(player, [card.id]);
      discardCards(game, [card]);
      drawCards(game, player, 2);
      addLog(game, `${player.name} 使用【无中生有】，摸两张牌。`);
      break;
    case "dismantle":
      useDismantle(game, player, card, targetId);
      break;
    case "steal":
      useSteal(game, player, card, targetId);
      break;
    case "duel":
      useDuel(game, player, card, targetId);
      break;
    case "barbarian":
      useAoe(game, player, card, "barbarian", "strike");
      break;
    case "arrows":
      useAoe(game, player, card, "arrows", "dodge");
      break;
    case "garden":
      removeCardsFromHand(player, [card.id]);
      discardCards(game, [card]);
      alivePlayers(game).forEach((target) => healPlayer(game, target.id, 1));
      addLog(game, `${player.name} 使用【桃园结义】，所有存活角色各回复 1 点体力。`);
      break;
    case "halberd":
    case "crossbow":
    case "war_armor":
      equipCard(game, player, card);
      break;
    default:
      throw new GameRuleError("这张牌当前不能主动使用。");
  }
}

export function playCardAs(game: GameState, playerId: PlayerId, cardId: string, as: CardUseAs, targetId?: PlayerId) {
  assertCanActInPlayStage(game, playerId);
  const player = requirePlayer(game, playerId);
  const card = requireHandCard(player, cardId);
  assert(card.key !== as, "这张牌本身就是该牌名，请直接使用。");
  assert(canUseCardAs(game, player, card, as), "你的武将不能这样转换这张牌。");

  if (as === "strike") {
    assert(typeof targetId === "string" && targetId.length > 0, "当【杀】使用需要选择目标。");
    playStrike(game, player, card, targetId);
    return;
  }

  if (as === "peach") {
    assert(!targetId || targetId === playerId, "【桃】只能给自己使用。");
    assert(player.hp < player.maxHp, "体力已满，不需要使用【桃】。");
    removeCardsFromHand(player, [card.id]);
    discardCards(game, [card]);
    healPlayer(game, player.id, 1, `${player.name} 将【${card.name}】当【桃】使用，回复 1 点体力。`);
    return;
  }

  throw new GameRuleError("出牌阶段不能主动当【闪】使用。");
}

export function useHeroSkill(game: GameState, playerId: PlayerId, cardIds: string[], targetId?: PlayerId) {
  assertCanActInPlayStage(game, playerId);
  const player = requirePlayer(game, playerId);
  assert(!player.skillUsed, "本回合已经发动过武将技。");

  if (player.heroId === "liu-bei") {
    assert(cardIds.length === 1, "仁望需要弃置 1 张手牌。");
    const target = targetId ? requirePlayer(game, targetId) : null;
    assert(target && target.alive, "请选择一名存活角色。");
    assert(target.hp < target.maxHp, "目标没有受伤。");
    const [card] = removeCardsFromHand(player, cardIds);
    discardCards(game, [card]);
    player.skillUsed = true;
    healPlayer(game, target.id, 1, `${player.name} 发动【仁望】，令 ${target.name} 回复 1 点体力。`);
    return;
  }

  if (player.heroId === "sun-quan") {
    assert(cardIds.length > 0, "衡策至少需要弃置 1 张手牌。");
    const cards = removeCardsFromHand(player, cardIds);
    discardCards(game, cards);
    drawCards(game, player, cards.length);
    player.skillUsed = true;
    addLog(game, `${player.name} 发动【衡策】，弃 ${cards.length} 张并摸 ${cards.length} 张。`);
    return;
  }

  throw new GameRuleError("这个武将没有可主动发动的技能。");
}

export function respondToPending(game: GameState, playerId: PlayerId, cardId: string) {
  assert(game.phase === "playing", "牌局尚未进行。");
  const pending = game.pending;
  assert(pending !== null, "当前没有需要响应的效果。");
  const player = requirePlayer(game, playerId);
  const card = requireHandCard(player, cardId);

  if (pending.kind === "dodge") {
    assert(playerId === pending.targetId, "只有被【杀】指定的角色需要出【闪】。");
    assert(canUseCardAs(game, player, card, "dodge"), "需要使用【闪】或可当【闪】的牌。");
    removeCardsFromHand(player, [card.id]);
    discardCards(game, [card]);
    game.pending = null;
    addLog(game, `${player.name} 响应【闪】，避开了 ${requirePlayer(game, pending.sourceId).name} 的【杀】。`);
    return;
  }

  if (pending.kind === "duel") {
    assert(playerId === pending.currentResponderId, "还没轮到你响应决斗。");
    assert(canUseCardAs(game, player, card, "strike"), "决斗需要打出【杀】。");
    removeCardsFromHand(player, [card.id]);
    discardCards(game, [card]);
    addLog(game, `${player.name} 在【决斗】中打出【杀】。`);
    game.pending = {
      ...pending,
      currentResponderId: pending.otherId,
      otherId: pending.currentResponderId
    };
    return;
  }

  if (pending.kind === "aoe") {
    const targetId = pending.targetIds[pending.index];
    assert(playerId === targetId, "当前由另一名角色响应群体锦囊。");
    assert(canUseCardAs(game, player, card, pending.response), `需要打出【${pending.response === "strike" ? "杀" : "闪"}】。`);
    removeCardsFromHand(player, [card.id]);
    discardCards(game, [card]);
    addLog(game, `${player.name} 响应了【${pending.cardKey === "barbarian" ? "南蛮入侵" : "万箭齐发"}】。`);
    advanceAoe(game, { ...pending, index: pending.index + 1 });
    return;
  }

  if (pending.kind === "dying") {
    assert(canUseCardAs(game, player, card, "peach"), "救援需要使用【桃】或可当【桃】的红色牌。");
    const target = requirePlayer(game, pending.targetId);
    removeCardsFromHand(player, [card.id]);
    discardCards(game, [card]);
    target.hp += 1;
    const needed = Math.max(0, 1 - target.hp);
    addLog(game, `${player.name} 对 ${target.name} 使用【桃】救援。`);
    if (needed === 0) {
      game.pending = null;
      addLog(game, `${target.name} 脱离濒死。`);
      runResume(game, pending.resume);
    } else {
      game.pending = {
        ...pending,
        needed,
        passedPlayerIds: []
      };
    }
  }
}

export function passPending(game: GameState, playerId: PlayerId) {
  assert(game.phase === "playing", "牌局尚未进行。");
  const pending = game.pending;
  assert(pending !== null, "当前没有需要跳过的响应。");

  if (pending.kind === "dodge") {
    assert(playerId === pending.targetId, "只有被【杀】指定的角色可以放弃出【闪】。");
    game.pending = null;
    applyDamage(game, pending.targetId, 1, pending.sourceId, "【杀】命中", { kind: "continuePlay" });
    return;
  }

  if (pending.kind === "duel") {
    assert(playerId === pending.currentResponderId, "还没轮到你响应决斗。");
    game.pending = null;
    applyDamage(game, pending.currentResponderId, 1, pending.otherId, "【决斗】落败", { kind: "endDuel" });
    return;
  }

  if (pending.kind === "aoe") {
    const targetId = pending.targetIds[pending.index];
    assert(playerId === targetId, "当前由另一名角色响应群体锦囊。");
    game.pending = null;
    applyDamage(game, targetId, 1, pending.sourceId, pending.cardKey === "barbarian" ? "【南蛮入侵】" : "【万箭齐发】", {
      kind: "continueAoe",
      aoe: { ...pending, index: pending.index + 1 }
    });
    return;
  }

  if (pending.kind === "dying") {
    assert(!pending.passedPlayerIds.includes(playerId), "你已经表示无法救援。");
    const passedPlayerIds = [...pending.passedPlayerIds, playerId];
    const aliveIds = alivePlayers(game).map((player) => player.id);
    const target = requirePlayer(game, pending.targetId);
    if (aliveIds.every((id) => passedPlayerIds.includes(id))) {
      game.pending = null;
      eliminatePlayer(game, target.id, pending.sourceId);
      runResume(game, pending.resume);
    } else {
      game.pending = { ...pending, passedPlayerIds };
      addLog(game, `${requirePlayer(game, playerId).name} 无法救援 ${target.name}。`);
    }
  }
}

export function endPlayStage(game: GameState, playerId: PlayerId) {
  assertCanActInPlayStage(game, playerId);
  const player = requirePlayer(game, playerId);
  const limit = handLimit(player);
  if (player.hand.length > limit) {
    game.stage = "discard";
    addLog(game, `${player.name} 进入弃牌阶段，需要弃 ${player.hand.length - limit} 张。`);
  } else {
    endTurn(game);
  }
}

export function discardForTurn(game: GameState, playerId: PlayerId, cardIds: string[]) {
  assert(game.phase === "playing" && game.stage === "discard", "当前不是弃牌阶段。");
  assert(game.activePlayerId === playerId, "只有当前回合角色可以弃牌。");
  const player = requirePlayer(game, playerId);
  const need = player.hand.length - handLimit(player);
  assert(need > 0, "不需要弃牌。");
  assert(cardIds.length === need, `需要弃 ${need} 张牌。`);
  const cards = removeCardsFromHand(player, cardIds);
  discardCards(game, cards);
  addLog(game, `${player.name} 弃置 ${cards.length} 张牌，结束回合。`);
  endTurn(game);
}

export function resetToLobby(game: GameState, playerId: PlayerId) {
  assert(game.hostId === playerId, "只有房主可以重开。");
  game.phase = "lobby";
  game.mode = getModeForPlayerCount(game.playerOrder.length).id;
  game.stage = "waiting";
  game.activePlayerId = null;
  game.pending = null;
  game.deck = [];
  game.discardPile = [];
  game.turnNumber = 0;
  game.startedAt = null;
  game.winner = null;
  game.finishReason = null;
  game.playerOrder.forEach((id, index) => {
    const player = game.players[id];
    player.seat = index;
    player.role = null;
    player.heroId = null;
    player.heroOptions = [];
    player.hp = 0;
    player.maxHp = 0;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.strikesUsed = 0;
    player.skillUsed = false;
    player.armorBlockedThisTurn = false;
    player.ready = false;
  });
  addLog(game, "牌局已回到大厅。");
}

export function createView(game: GameState, viewerId: PlayerId): GameView {
  const viewer = requirePlayer(game, viewerId);
  const players = game.playerOrder.map((id) => toPublicPlayer(game, game.players[id], viewerId));
  const mode = game.phase === "lobby" ? getModeForPlayerCount(game.playerOrder.length) : GAME_MODES[game.mode];
  return {
    roomCode: game.roomCode,
    mode,
    phase: game.phase,
    stage: game.stage,
    selfId: viewerId,
    players,
    self: {
      ...toPublicPlayer(game, viewer, viewerId),
      hand: viewer.hand,
      heroOptions: viewer.heroOptions
    },
    hostId: game.hostId,
    activePlayerId: game.activePlayerId,
    pending: game.pending,
    deckCount: game.deck.length,
    discardCount: game.discardPile.length,
    turnNumber: game.turnNumber,
    startedAt: game.startedAt,
    winner: game.winner,
    finishReason: game.finishReason,
    log: game.log
  };
}

export function canUseCardAs(_game: GameState, player: PlayerState, card: GameCard, as: "strike" | "dodge" | "peach") {
  if (card.key === as) return true;

  // 关羽式红牌转杀：只看颜色，不看原牌名，因此红桃/方片都能当进攻牌。
  if (as === "strike" && player.heroId === "guan-yu" && card.color === "red") return true;

  // 赵云式攻防互换：杀可当闪，闪可当杀。
  if (player.heroId === "zhao-yun") {
    if (as === "strike" && card.key === "dodge") return true;
    if (as === "dodge" && card.key === "strike") return true;
  }

  // 华佗式红牌救人：红色手牌可以当作桃。
  if (as === "peach" && player.heroId === "hua-tuo" && card.color === "red") return true;

  return false;
}

export function attackRange(player: PlayerState) {
  const weapon = player.equipment.weapon;
  return weapon?.range ?? 1;
}

export function distanceBetween(game: GameState, sourceId: PlayerId, targetId: PlayerId) {
  const aliveIds = alivePlayers(game).map((player) => player.id);
  const sourceIndex = aliveIds.indexOf(sourceId);
  const targetIndex = aliveIds.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return Number.POSITIVE_INFINITY;
  const raw = Math.abs(sourceIndex - targetIndex);
  return Math.min(raw, aliveIds.length - raw);
}

function startPlaying(game: GameState) {
  game.phase = "playing";
  const mode = GAME_MODES[game.mode];
  game.startedAt = Date.now();
  game.deck = buildDeck(game);
  game.discardPile = [];
  game.pending = null;
  game.turnNumber = 0;

  game.playerOrder.forEach((id) => {
    const player = game.players[id];
    const hero = getHero(player.heroId);
    assert(hero, "存在未选择武将的玩家。");
    // 多人身份局主公额外拥有 1 点体力上限；2 人单挑和 3 人乱战不加，避免主将过硬。
    const lordBonus = player.role === "lord" && mode.lordHpBonus ? 1 : 0;
    player.maxHp = hero.maxHp + lordBonus;
    player.hp = player.maxHp;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.strikesUsed = 0;
    player.skillUsed = false;
    player.armorBlockedThisTurn = false;
    drawCards(game, player, mode.startingHand);
  });

  const lord = getLord(game);
  assert(lord, "没有主公，无法开始。");
  addLog(game, `${mode.name}开始，初始手牌已发放。`);
  beginTurn(game, lord.id);
}

function beginTurn(game: GameState, playerId: PlayerId) {
  if (game.phase !== "playing") return;
  const player = requirePlayer(game, playerId);
  if (!player.alive) {
    beginTurn(game, nextAlivePlayerId(game, playerId));
    return;
  }

  game.pending = null;
  game.activePlayerId = player.id;
  game.stage = "play";
  game.turnNumber += 1;
  player.strikesUsed = 0;
  player.skillUsed = false;
  player.armorBlockedThisTurn = false;

  const mode = GAME_MODES[game.mode];
  // 周瑜式摸牌技：额外摸牌发生在摸牌阶段，服务端直接并入回合开始摸牌。
  const baseDraw = game.turnNumber === 0 ? mode.firstTurnDraw : mode.drawPerTurn;
  const drawCount = player.heroId === "zhou-yu" ? baseDraw + 1 : baseDraw;
  drawCards(game, player, drawCount);
  addLog(game, `第 ${game.turnNumber} 回合：${player.name} 摸 ${drawCount} 张牌并进入出牌阶段。`);
}

function endTurn(game: GameState) {
  if (game.phase !== "playing" || !game.activePlayerId) return;
  const endedPlayer = requirePlayer(game, game.activePlayerId);
  addLog(game, `${endedPlayer.name} 的回合结束。`);
  const nextId = nextAlivePlayerId(game, endedPlayer.id);
  game.stage = "waiting";
  game.activePlayerId = null;
  if (game.phase === "playing") beginTurn(game, nextId);
}

function playStrike(game: GameState, player: PlayerState, card: GameCard, targetId: PlayerId) {
  assertCanTargetOther(game, player.id, targetId);
  const target = requirePlayer(game, targetId);
  const range = attackRange(player);
  assert(distanceBetween(game, player.id, target.id) <= range, `目标距离超出攻击范围 ${range}。`);
  assert(canUseStrikeThisTurn(player), "本回合已经使用过【杀】。");

  removeCardsFromHand(player, [card.id]);
  discardCards(game, [card]);
  player.strikesUsed += 1;
  game.pending = {
    kind: "dodge",
    sourceId: player.id,
    targetId: target.id,
    cardName: "杀"
  };
  addLog(game, `${player.name} 对 ${target.name} 使用【杀】，等待 ${target.name} 出【闪】。`);
}

function useDismantle(game: GameState, player: PlayerState, card: GameCard, targetId?: PlayerId) {
  assertCanTargetOther(game, player.id, targetId);
  const target = requirePlayer(game, targetId);
  removeCardsFromHand(player, [card.id]);
  discardCards(game, [card]);
  const removed = takeRandomCardOrEquipment(game, target);
  if (removed) {
    discardCards(game, [removed]);
    addLog(game, `${player.name} 使用【过河拆桥】，弃置 ${target.name} 的一张牌。`);
  } else {
    addLog(game, `${player.name} 使用【过河拆桥】，但 ${target.name} 没有可弃置的牌。`);
  }
}

function useSteal(game: GameState, player: PlayerState, card: GameCard, targetId?: PlayerId) {
  assertCanTargetOther(game, player.id, targetId);
  const target = requirePlayer(game, targetId);
  assert(target.hand.length > 0, "目标没有手牌可获得。");
  removeCardsFromHand(player, [card.id]);
  discardCards(game, [card]);
  const index = randomInt(game, target.hand.length);
  const [stolen] = target.hand.splice(index, 1);
  player.hand.push(stolen);
  addLog(game, `${player.name} 使用【顺手牵羊】，获得 ${target.name} 的一张手牌。`);
}

function useDuel(game: GameState, player: PlayerState, card: GameCard, targetId?: PlayerId) {
  assertCanTargetOther(game, player.id, targetId);
  const target = requirePlayer(game, targetId);
  removeCardsFromHand(player, [card.id]);
  discardCards(game, [card]);
  game.pending = {
    kind: "duel",
    sourceId: player.id,
    targetId: target.id,
    currentResponderId: target.id,
    otherId: player.id
  };
  addLog(game, `${player.name} 向 ${target.name} 发起【决斗】，${target.name} 先打出【杀】。`);
}

function useAoe(game: GameState, player: PlayerState, card: GameCard, cardKey: "barbarian" | "arrows", response: "strike" | "dodge") {
  removeCardsFromHand(player, [card.id]);
  discardCards(game, [card]);
  const targetIds = alivePlayers(game)
    .filter((target) => target.id !== player.id)
    .map((target) => target.id);
  const pending: AoePending = {
    kind: "aoe",
    sourceId: player.id,
    cardKey,
    response,
    targetIds,
    index: 0
  };
  addLog(game, `${player.name} 使用【${cardKey === "barbarian" ? "南蛮入侵" : "万箭齐发"}】。`);
  advanceAoe(game, pending);
}

function equipCard(game: GameState, player: PlayerState, card: GameCard) {
  const slot = card.equipmentSlot;
  assert(slot, "装备牌缺少装备栏位。");
  removeCardsFromHand(player, [card.id]);
  const previous = player.equipment[slot];
  if (previous) discardCards(game, [previous]);
  player.equipment[slot] = card;
  addLog(game, `${player.name} 装备【${card.name}】。`);
}

function advanceAoe(game: GameState, pending: AoePending) {
  if (game.phase !== "playing") return;
  let index = pending.index;
  while (index < pending.targetIds.length) {
    const target = game.players[pending.targetIds[index]];
    if (target?.alive) break;
    index += 1;
  }

  if (index >= pending.targetIds.length) {
    game.pending = null;
    addLog(game, `【${pending.cardKey === "barbarian" ? "南蛮入侵" : "万箭齐发"}】结算完毕。`);
    runResume(game, { kind: "continuePlay" });
    return;
  }

  const target = requirePlayer(game, pending.targetIds[index]);
  game.pending = { ...pending, index };
  addLog(game, `${target.name} 需要打出【${pending.response === "strike" ? "杀" : "闪"}】。`);
}

function applyDamage(game: GameState, targetId: PlayerId, amount: number, sourceId: PlayerId | null, reason: string, resume: ResumeAction) {
  const target = requirePlayer(game, targetId);
  if (!target.alive) {
    runResume(game, resume);
    return;
  }

  let finalAmount = amount;
  if (target.equipment.armor?.key === "war_armor" && !target.armorBlockedThisTurn) {
    target.armorBlockedThisTurn = true;
    finalAmount = Math.max(0, finalAmount - 1);
    addLog(game, `${target.name} 的【明光铠】抵挡 1 点伤害。`);
  }

  if (finalAmount <= 0) {
    runResume(game, resume);
    return;
  }

  target.hp -= finalAmount;
  addLog(game, `${target.name} 因${reason}受到 ${finalAmount} 点伤害，体力 ${Math.max(target.hp, 0)}/${target.maxHp}。`);

  if (target.heroId === "cao-cao" && target.hp > 0) {
    drawCards(game, target, 1);
    addLog(game, `${target.name} 触发【归略】，摸一张牌。`);
  }

  if (target.hp <= 0) {
    game.pending = {
      kind: "dying",
      targetId: target.id,
      sourceId,
      needed: 1 - target.hp,
      passedPlayerIds: [],
      resume
    };
    addLog(game, `${target.name} 濒死，需要 ${1 - target.hp} 张【桃】救援。`);
    return;
  }

  runResume(game, resume);
}

function healPlayer(game: GameState, targetId: PlayerId, amount: number, message?: string) {
  const target = requirePlayer(game, targetId);
  if (!target.alive) return;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  if (message && target.hp !== before) addLog(game, message);
}

function eliminatePlayer(game: GameState, targetId: PlayerId, sourceId: PlayerId | null) {
  const target = requirePlayer(game, targetId);
  if (!target.alive) return;
  target.alive = false;
  target.hp = 0;
  discardCards(game, target.hand.splice(0));
  discardCards(game, Object.values(target.equipment).filter(Boolean) as GameCard[]);
  target.equipment = {};
  addLog(game, `${target.name} 阵亡，身份是【${getRoleLabel(target.role, game.mode)}】。`);

  const source = sourceId ? game.players[sourceId] : null;
  if (source?.alive && target.role === "rebel") {
    drawCards(game, source, 3);
    addLog(game, `${source.name} 击败反贼，摸三张奖励牌。`);
  }
  if (source?.alive && source.role === "lord" && target.role === "loyalist") {
    discardCards(game, source.hand.splice(0));
    discardCards(game, Object.values(source.equipment).filter(Boolean) as GameCard[]);
    source.equipment = {};
    addLog(game, `${source.name} 误伤忠臣，弃置所有手牌和装备。`);
  }

  checkWin(game);
}

function runResume(game: GameState, resume: ResumeAction) {
  if (game.phase !== "playing") return;
  checkWin(game);
  if (game.phase !== "playing") return;

  if (resume.kind === "continueAoe") {
    advanceAoe(game, resume.aoe);
    return;
  }

  game.pending = null;
  if (game.activePlayerId && !game.players[game.activePlayerId]?.alive) {
    endTurn(game);
    return;
  }
  game.stage = "play";
}

function checkWin(game: GameState) {
  if (game.phase !== "playing") return;
  const alive = alivePlayers(game);

  if (game.mode === "duel") {
    if (alive.length === 1) {
      finishGame(game, alive[0].name, "双雄对决中，对手已经倒下。");
    }
    return;
  }

  const lord = getLord(game);
  if (!lord) return;
  const aliveRoles = new Set(alive.map((player) => player.role));

  if (!lord.alive) {
    const renegade = alive.find((player) => player.role === "renegade");
    if (alive.length === 1 && renegade) {
      finishGame(game, `${renegade.name}（内奸）`, "主公倒下，内奸成为最后存活者。");
    } else {
      finishGame(game, "反贼阵营", "主公阵亡。");
    }
    return;
  }

  if (!aliveRoles.has("rebel") && !aliveRoles.has("renegade")) {
    finishGame(game, "主忠阵营", "所有反贼和内奸都已出局。");
  }
}

function finishGame(game: GameState, winner: string, reason: string) {
  game.phase = "finished";
  game.stage = "waiting";
  game.activePlayerId = null;
  game.pending = null;
  game.winner = winner;
  game.finishReason = reason;
  addLog(game, `牌局结束：${winner} 获胜。${reason}`);
}

function buildDeck(game: GameState) {
  const deck: GameCard[] = [];
  let serial = 1;
  let faceIndex = 0;
  CARDS.forEach((def) => {
    for (let copy = 0; copy < def.count; copy += 1) {
      const suit = SUITS[faceIndex % SUITS.length];
      const rank = RANKS[faceIndex % RANKS.length];
      const color: CardColor = suit === "heart" || suit === "diamond" ? "red" : "black";
      deck.push({
        id: `${def.key}-${serial}`,
        key: def.key,
        name: def.name,
        type: def.type,
        suit,
        color,
        rank,
        description: def.description,
        target: def.target,
        equipmentSlot: def.equipmentSlot,
        range: def.range
      });
      serial += 1;
      faceIndex += 1;
    }
  });
  return shuffle(game, deck);
}

function drawCards(game: GameState, player: PlayerState, count: number) {
  for (let index = 0; index < count; index += 1) {
    if (game.deck.length === 0) {
      if (game.discardPile.length === 0) return;
      game.deck = shuffle(game, game.discardPile.splice(0));
      addLog(game, "弃牌堆洗回牌堆。");
    }
    const card = game.deck.pop();
    if (card) player.hand.push(card);
  }
}

function discardCards(game: GameState, cards: GameCard[]) {
  game.discardPile.push(...cards);
}

function takeRandomCardOrEquipment(game: GameState, target: PlayerState) {
  if (target.hand.length > 0) {
    const index = randomInt(game, target.hand.length);
    const [card] = target.hand.splice(index, 1);
    return card;
  }
  const slots: EquipmentSlot[] = ["weapon", "armor"];
  const slot = slots.find((candidate) => target.equipment[candidate]);
  if (!slot) return null;
  const card = target.equipment[slot] ?? null;
  delete target.equipment[slot];
  return card;
}

function removeCardsFromHand(player: PlayerState, cardIds: string[]) {
  const cards: GameCard[] = [];
  cardIds.forEach((cardId) => {
    const index = player.hand.findIndex((card) => card.id === cardId);
    assert(index >= 0, "手牌中没有这张牌。");
    const [card] = player.hand.splice(index, 1);
    cards.push(card);
  });
  return cards;
}

function requireHandCard(player: PlayerState, cardId: string) {
  const card = player.hand.find((candidate) => candidate.id === cardId);
  assert(card, "手牌中没有这张牌。");
  return card;
}

function canUseStrikeThisTurn(player: PlayerState) {
  if (player.heroId === "zhang-fei") return true;
  if (player.equipment.weapon?.key === "crossbow") return true;
  return player.strikesUsed < 1;
}

function handLimit(player: PlayerState) {
  return Math.max(0, player.hp);
}

function alivePlayers(game: GameState) {
  return game.playerOrder.map((id) => game.players[id]).filter((player) => player.alive);
}

function getLord(game: GameState) {
  return game.playerOrder.map((id) => game.players[id]).find((player) => player.role === "lord") ?? null;
}

function nextAlivePlayerId(game: GameState, afterPlayerId: PlayerId) {
  const start = game.playerOrder.indexOf(afterPlayerId);
  for (let offset = 1; offset <= game.playerOrder.length; offset += 1) {
    const id = game.playerOrder[(start + offset + game.playerOrder.length) % game.playerOrder.length];
    if (game.players[id]?.alive) return id;
  }
  return afterPlayerId;
}

function toPublicPlayer(game: GameState, player: PlayerState, viewerId: PlayerId): PublicPlayerView {
  const mode = GAME_MODES[game.mode];
  const roleVisible =
    mode.publicRoles || player.id === viewerId || player.role === "lord" || !player.alive || game.phase === "finished"
      ? player.role
      : null;
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    online: player.online,
    isHost: player.isHost,
    role: roleVisible,
    heroId: player.heroId,
    hp: player.hp,
    maxHp: player.maxHp,
    alive: player.alive,
    handCount: player.hand.length,
    equipment: player.equipment,
    strikesUsed: player.strikesUsed,
    skillUsed: player.skillUsed,
    armorBlockedThisTurn: player.armorBlockedThisTurn,
    ready: player.ready
  };
}

function assertCanActInPlayStage(game: GameState, playerId: PlayerId) {
  assert(game.phase === "playing", "牌局尚未开始。");
  assert(game.pending === null, "当前有待响应的效果，不能出牌。");
  assert(game.stage === "play", "当前不是出牌阶段。");
  assert(game.activePlayerId === playerId, "还没轮到你行动。");
  const player = requirePlayer(game, playerId);
  assert(player.alive, "阵亡角色不能行动。");
}

function assertCanTargetOther(game: GameState, sourceId: PlayerId, targetId?: PlayerId): asserts targetId is PlayerId {
  assert(typeof targetId === "string" && targetId.length > 0, "请选择目标。");
  assert(targetId !== sourceId, "不能指定自己为目标。");
  const target = requirePlayer(game, targetId);
  assert(target.alive, "目标已经阵亡。");
}

function requirePlayer(game: GameState, playerId: PlayerId) {
  const player = game.players[playerId];
  assert(player, "找不到玩家。");
  return player;
}

function addLog(game: GameState, text: string) {
  game.log = [
    {
      id: `${Date.now()}-${game.log.length}-${Math.random().toString(36).slice(2)}`,
      time: Date.now(),
      text
    },
    ...game.log
  ].slice(0, MAX_LOG);
}

function cleanName(name: string) {
  const trimmed = name.trim().slice(0, 12);
  return trimmed || "无名客";
}

function shuffle<T>(game: GameState, items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(game, index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function dealHeroOptions(heroPool: string[], playerIndex: number, count: number) {
  const options: string[] = [];
  let offset = 0;
  while (options.length < count && offset < heroPool.length * 2) {
    const heroId = heroPool[(playerIndex * count + offset) % heroPool.length];
    if (!options.includes(heroId)) options.push(heroId);
    offset += 1;
  }
  return options;
}

function randomInt(game: GameState, max: number) {
  return Math.floor(nextRandom(game) * max);
}

function nextRandom(game: GameState) {
  game.seed = (game.seed * 1_664_525 + 1_013_904_223) >>> 0;
  return game.seed / 4_294_967_296;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GameRuleError(message);
}

export function describeCardUse(card: GameCard, player: PlayerState, intent: "strike" | "dodge" | "peach") {
  const natural = getCardDef(card.key)?.name ?? card.name;
  if (card.key === intent) return natural;
  if (player.heroId === "guan-yu" && intent === "strike" && card.color === "red") return `${natural}当【杀】`;
  if (player.heroId === "zhao-yun" && intent === "strike" && card.key === "dodge") return "【闪】当【杀】";
  if (player.heroId === "zhao-yun" && intent === "dodge" && card.key === "strike") return "【杀】当【闪】";
  if (player.heroId === "hua-tuo" && intent === "peach" && card.color === "red") return `${natural}当【桃】`;
  return natural;
}
