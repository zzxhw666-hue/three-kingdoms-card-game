import { describe, expect, it } from "vitest";
import {
  addOrReconnectPlayer,
  chooseHero,
  createGame,
  createView,
  passPending,
  playCard,
  respondToPending,
  startHeroSelect
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
});

function setupGame(playerCount: number) {
  const game = createGame("TEST");
  game.seed = 42;
  for (let index = 0; index < playerCount; index += 1) {
    addOrReconnectPlayer(game, `p${index + 1}`, `玩家${index + 1}`);
  }
  startHeroSelect(game, "p1");
  game.playerOrder.forEach((id) => {
    chooseHero(game, id, game.players[id].heroOptions[0]);
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
  return {
    id: `test-${key}-${Math.random()}`,
    key,
    name,
    type: key === "strike" || key === "dodge" || key === "peach" ? "basic" : "trick",
    suit,
    color: suit === "heart" || suit === "diamond" ? "red" : "black",
    rank: "A",
    description: "测试牌",
    target: key === "strike" ? "singleEnemy" : key === "peach" ? "self" : "none"
  };
}
