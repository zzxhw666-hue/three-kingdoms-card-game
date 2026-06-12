import { describe, expect, it } from "vitest";
import {
  addOrReconnectPlayer,
  chooseHero,
  createGame,
  createView,
  passPending,
  playCard,
  playCardAs,
  refreshActionDeadline,
  respondToPending,
  resolveTimedAction,
  startHeroSelect,
  useHeroSkill
} from "./engine";
import type { GameCard, GameState, PlayerState } from "./types";

describe("identity card engine", () => {
  it("assigns identities, lets every player choose a hero, and starts from the lord", () => {
    const game = setupGame(4);
    expect(game.phase).toBe("playing");
    expect(game.activePlayerId).toBe(game.playerOrder.find((id) => game.players[id].role === "lord"));
    expect(game.playerOrder.every((id) => game.players[id].hand.length >= 4)).toBe(true);
  });

  it("uses public duel rules for two players", () => {
    const game = setupGame(2);
    const firstView = createView(game, "p1");
    const secondView = createView(game, "p2");

    expect(firstView.mode.id).toBe("duel");
    expect(firstView.players.every((player) => player.role !== null)).toBe(true);
    expect(secondView.players.every((player) => player.role !== null)).toBe(true);
    expect(game.players.p1.role).toBe("lord");
    expect(game.players.p2.role).toBe("rebel");
  });

  it("prevents players from choosing the same hero in one game", () => {
    const game = createGame("TEST");
    addOrReconnectPlayer(game, "p1", "玩家1");
    addOrReconnectPlayer(game, "p2", "玩家2");
    startHeroSelect(game, "p1");
    const heroId = game.players.p1.heroOptions[0];

    chooseHero(game, "p1", heroId);

    expect(() => chooseHero(game, "p2", heroId)).toThrow("这个武将已经被其他玩家选择。");
  });

  it("creates a dodge response when strike is used and deals damage if target passes", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    const strike = testCard("strike", "杀");
    source.hand.push(strike);

    playCard(game, source.id, strike.id, target.id);
    expect(game.pending?.kind).toBe("dodge");

    passPending(game, target.id);
    expect(game.pending).toBe(null);
    expect(target.hp).toBe(target.maxHp - 1);
  });

  it("automatically skips a pending response when the action timer expires", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    const strike = testCard("strike", "杀");
    source.hand.push(strike);

    playCard(game, source.id, strike.id, target.id);
    refreshActionDeadline(game, 1_000);
    resolveTimedAction(game, 11_000);

    expect(game.pending).toBe(null);
    expect(target.hp).toBe(target.maxHp - 1);
  });

  it("allows a dying player to be rescued by peach", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    const strike = testCard("strike", "杀");
    const peach = testCard("peach", "桃", "heart");
    source.hand.push(strike);
    target.hand.push(peach);
    target.hp = 1;

    playCard(game, source.id, strike.id, target.id);
    passPending(game, target.id);
    expect(game.pending?.kind).toBe("dying");

    respondToPending(game, target.id, peach.id);
    expect(game.pending).toBe(null);
    expect(target.hp).toBe(1);
    expect(target.alive).toBe(true);
    expect(game.phase).toBe("playing");
  });

  it("does not force Guan Yu red cards to become strike when using the printed card", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    source.heroId = "guan-yu";
    const redDismantle = testCard("dismantle", "过河拆桥", "heart");
    const targetCard = testCard("dodge", "闪");
    source.hand.push(redDismantle);
    target.hand.push(targetCard);
    const targetHp = target.hp;
    const targetHandBefore = target.hand.length;

    playCard(game, source.id, redDismantle.id, target.id);

    expect(game.pending).toBe(null);
    expect(target.hp).toBe(targetHp);
    expect(target.hand.length).toBe(targetHandBefore - 1);
  });

  it("lets Guan Yu explicitly convert a red card into strike", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    source.heroId = "guan-yu";
    const redDismantle = testCard("dismantle", "过河拆桥", "heart");
    source.hand.push(redDismantle);

    playCardAs(game, source.id, redDismantle.id, "strike", target.id);

    expect(game.pending?.kind).toBe("dodge");
  });

  it("keeps Hua Tuo red trick cards as their printed trick unless explicitly converted", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    source.heroId = "hua-tuo";
    source.hp = source.maxHp - 1;
    const redDraw = testCard("draw_two", "无中生有", "heart");
    source.hand.push(redDraw);
    const hpBefore = source.hp;

    playCard(game, source.id, redDraw.id);

    expect(source.hp).toBe(hpBefore);
    expect(game.pending).toBe(null);
  });

  it("lets Zhang Fei use more than one strike in the same play stage", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    source.heroId = "zhang-fei";
    const firstStrike = testCard("strike", "杀");
    const secondStrike = testCard("strike", "杀");
    source.hand.push(firstStrike, secondStrike);

    playCard(game, source.id, firstStrike.id, target.id);
    passPending(game, target.id);
    playCard(game, source.id, secondStrike.id, target.id);

    expect(game.pending?.kind).toBe("dodge");
    expect(source.strikesUsed).toBe(2);
  });

  it("applies wine bonus to the next strike and records a shared effect", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    source.heroId = "cao-cao";
    const wine = testCard("wine", "烈酒", "heart");
    const strike = testCard("strike", "杀");
    source.hand.push(wine, strike);

    playCard(game, source.id, wine.id);
    expect(source.strikeDamageBonus).toBe(1);
    expect(game.latestEffect?.title).toBe("烈酒");

    playCard(game, source.id, strike.id, target.id);
    passPending(game, target.id);

    expect(target.hp).toBe(target.maxHp - 2);
  });

  it("requires two dodges against Lu Bu strike", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    source.heroId = "lv-bu";
    const strike = testCard("strike", "杀");
    const firstDodge = testCard("dodge", "闪");
    const secondDodge = testCard("dodge", "闪");
    source.hand.push(strike);
    target.hand.push(firstDodge, secondDodge);

    playCard(game, source.id, strike.id, target.id);
    expect(game.pending?.kind).toBe("dodge");
    if (game.pending?.kind !== "dodge") throw new Error("expected dodge pending");
    expect(game.pending.required).toBe(2);

    respondToPending(game, target.id, firstDodge.id);
    expect(game.pending?.kind).toBe("dodge");
    if (game.pending?.kind !== "dodge") throw new Error("expected dodge pending");
    expect(game.pending.received).toBe(1);

    respondToPending(game, target.id, secondDodge.id);
    expect(game.pending).toBe(null);
    expect(target.hp).toBe(target.maxHp);
  });

  it("uses Zhang Liao active skill and records a skill effect", () => {
    const game = setupGame(2);
    const source = activePlayer(game);
    const target = firstEnemy(game, source.id);
    source.heroId = "zhang-liao";
    source.skillUsed = false;
    target.hand.push(testCard("dodge", "闪"));
    const targetHandBefore = target.hand.length;

    useHeroSkill(game, source.id, [], target.id);

    expect(target.hand.length).toBe(targetHandBefore - 1);
    expect(source.hand.length).toBeGreaterThan(0);
    expect(game.latestEffect?.kind).toBe("skill");
    expect(game.latestEffect?.title).toBe("突袭");
  });

  it("automatically advances play and discard stages when the action timer expires", () => {
    const game = setupGame(2);
    const firstPlayerId = game.activePlayerId!;
    const firstPlayer = game.players[firstPlayerId];
    firstPlayer.hand.push(testCard("dodge", "闪"), testCard("dodge", "闪"));

    refreshActionDeadline(game, 1_000);
    resolveTimedAction(game, 11_000);

    expect(game.activePlayerId).toBe(firstPlayerId);
    expect(game.stage).toBe("discard");

    refreshActionDeadline(game, 12_000);
    resolveTimedAction(game, 22_000);

    expect(game.activePlayerId).not.toBe(firstPlayerId);
    expect(game.stage).toBe("play");
  });
});

function setupGame(playerCount: number) {
  const game = createGame("TEST");
  game.seed = 42;
  for (let index = 0; index < playerCount; index += 1) {
    addOrReconnectPlayer(game, `p${index + 1}`, `玩家${index + 1}`);
  }
  startHeroSelect(game, "p1");
  game.playerOrder.forEach((id) => {
    const taken = new Set(game.playerOrder.map((playerId) => game.players[playerId].heroId).filter(Boolean));
    const heroId = game.players[id].heroOptions.find((option) => !taken.has(option));
    expect(heroId).toBeTruthy();
    chooseHero(game, id, heroId!);
  });
  return game;
}

function activePlayer(game: GameState) {
  expect(game.activePlayerId).toBeTruthy();
  return game.players[game.activePlayerId!];
}

function firstEnemy(game: GameState, sourceId: string) {
  const target = game.playerOrder.map((id) => game.players[id]).find((player) => player.id !== sourceId && player.alive);
  expect(target).toBeTruthy();
  return target as PlayerState;
}

function testCard(key: GameCard["key"], name: string, suit: GameCard["suit"] = "spade"): GameCard {
  const basicKeys = new Set(["strike", "dodge", "peach", "wine"]);
  return {
    id: `test-${key}-${Math.random()}`,
    key,
    name,
    type: basicKeys.has(key) ? "basic" : "trick",
    suit,
    color: suit === "heart" || suit === "diamond" ? "red" : "black",
    rank: "A",
    description: "测试牌",
    target: key === "strike" ? "singleEnemy" : key === "peach" ? "self" : "none"
  };
}
