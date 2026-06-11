import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  GameRuleError,
  addOrReconnectPlayer,
  chooseHero,
  createGame,
  createView,
  discardForTurn,
  endPlayStage,
  markPlayerOffline,
  passPending,
  playCard,
  resetToLobby,
  respondToPending,
  startHeroSelect,
  useHeroSkill
} from "../src/game/engine";
import type { GameState, PlayerId } from "../src/game/types";

type ClientMessage =
  | { type: "createRoom"; playerId: PlayerId; name: string }
  | { type: "joinRoom"; roomCode: string; playerId: PlayerId; name: string }
  | { type: "startGame" }
  | { type: "chooseHero"; heroId: string }
  | { type: "playCard"; cardId: string; targetId?: PlayerId }
  | { type: "useSkill"; cardIds: string[]; targetId?: PlayerId }
  | { type: "respond"; cardId: string }
  | { type: "passPending" }
  | { type: "endPlay" }
  | { type: "discard"; cardIds: string[] }
  | { type: "resetToLobby" };

interface RoomRecord {
  game: GameState;
  sockets: Map<PlayerId, WebSocket>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "dist");
const port = Number(process.env.PORT ?? 5466);
const rooms = new Map<string, RoomRecord>();

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const assetPath = safeAssetPath(url.pathname);
  const filePath = pickStaticFile(assetPath);

  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("请先运行 npm run build。");
    return;
  }

  response.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable"
  });
  response.end(readFileSync(filePath));
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  let attachedRoomCode: string | null = null;
  let attachedPlayerId: PlayerId | null = null;

  socket.on("message", (payload) => {
    try {
      const message = JSON.parse(payload.toString()) as ClientMessage;
      if (message.type === "createRoom") {
        const roomCode = createRoomCode();
        const room: RoomRecord = {
          game: createGame(roomCode),
          sockets: new Map()
        };
        rooms.set(roomCode, room);
        addOrReconnectPlayer(room.game, message.playerId, message.name);
        attachSocket(roomCode, message.playerId, socket);
        attachedRoomCode = roomCode;
        attachedPlayerId = message.playerId;
        send(socket, { type: "joined", roomCode, playerId: message.playerId });
        broadcast(roomCode);
        return;
      }

      if (message.type === "joinRoom") {
        const roomCode = normalizeRoomCode(message.roomCode);
        const room = rooms.get(roomCode);
        if (!room) throw new GameRuleError("没有找到这个房间。");
        addOrReconnectPlayer(room.game, message.playerId, message.name);
        attachSocket(roomCode, message.playerId, socket);
        attachedRoomCode = roomCode;
        attachedPlayerId = message.playerId;
        send(socket, { type: "joined", roomCode, playerId: message.playerId });
        broadcast(roomCode);
        return;
      }

      if (!attachedPlayerId) throw new GameRuleError("请先创建或加入房间。");
      const room = requireAttachedRoom(attachedRoomCode, attachedPlayerId);
      const playerId = attachedPlayerId;

      switch (message.type) {
        case "startGame":
          startHeroSelect(room.game, playerId);
          break;
        case "chooseHero":
          chooseHero(room.game, playerId, message.heroId);
          break;
        case "playCard":
          playCard(room.game, playerId, message.cardId, message.targetId);
          break;
        case "useSkill":
          useHeroSkill(room.game, playerId, message.cardIds, message.targetId);
          break;
        case "respond":
          respondToPending(room.game, playerId, message.cardId);
          break;
        case "passPending":
          passPending(room.game, playerId);
          break;
        case "endPlay":
          endPlayStage(room.game, playerId);
          break;
        case "discard":
          discardForTurn(room.game, playerId, message.cardIds);
          break;
        case "resetToLobby":
          resetToLobby(room.game, playerId);
          break;
        default:
          throw new GameRuleError("未知指令。");
      }

      broadcast(attachedRoomCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败。";
      send(socket, { type: "error", message });
    }
  });

  socket.on("close", () => {
    if (!attachedRoomCode || !attachedPlayerId) return;
    const room = rooms.get(attachedRoomCode);
    if (!room) return;
    if (room.sockets.get(attachedPlayerId) === socket) {
      room.sockets.delete(attachedPlayerId);
      markPlayerOffline(room.game, attachedPlayerId);
      broadcast(attachedRoomCode);
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`群雄牌局已启动：http://localhost:${port}`);
});

function attachSocket(roomCode: string, playerId: PlayerId, socket: WebSocket) {
  const room = rooms.get(roomCode);
  if (!room) throw new GameRuleError("房间不存在。");
  const previous = room.sockets.get(playerId);
  if (previous && previous !== socket) previous.close();
  room.sockets.set(playerId, socket);
}

function requireAttachedRoom(roomCode: string | null, playerId: PlayerId | null) {
  if (!roomCode || !playerId) throw new GameRuleError("请先创建或加入房间。");
  const room = rooms.get(roomCode);
  if (!room) throw new GameRuleError("房间已不存在。");
  return room;
}

function broadcast(roomCode: string | null) {
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  if (!room) return;
  room.sockets.forEach((socket, playerId) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    send(socket, {
      type: "state",
      view: createView(room.game, playerId)
    });
  });
}

function send(socket: WebSocket, data: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let code = "";
    for (let index = 0; index < 4; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new GameRuleError("暂时无法创建房间，请重试。");
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function safeAssetPath(urlPath: string) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return normalized === "/" ? "/index.html" : normalized;
}

function pickStaticFile(assetPath: string) {
  if (!existsSync(distRoot)) return null;
  const candidate = path.join(distRoot, assetPath);
  if (candidate.startsWith(distRoot) && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  const indexFile = path.join(distRoot, "index.html");
  return existsSync(indexFile) ? indexFile : null;
}

function contentType(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}
