import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  Copy,
  Crown,
  DoorOpen,
  HeartPulse,
  LogIn,
  Play,
  RotateCcw,
  Send,
  Shield,
  SkipForward,
  Sparkles,
  Swords,
  Users,
  Wifi,
  XCircle
} from "lucide-react";
import {
  CARDS,
  HEROES,
  KINGDOM_COLORS,
  KINGDOM_LABELS,
  SKILL_KIND_LABELS,
  getHero,
  getModeForPlayerCount,
  getRoleGoal,
  getRoleLabel
} from "./game/content";
import type { CardUseAs, GameCard, GameView, PendingAction, PlayerId, PublicPlayerView } from "./game/types";

type ServerMessage =
  | { type: "joined"; roomCode: string; playerId: PlayerId }
  | { type: "state"; view: GameView }
  | { type: "error"; message: string }
  | { type: "kicked"; message: string };

const PLAYER_ID_KEY = "kingdom-card:player-id";
const PLAYER_NAME_KEY = "kingdom-card:name";

export function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const [playerId] = useState(() => loadPlayerId());
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) ?? "");
  const [roomCodeInput, setRoomCodeInput] = useState(() => getRoomFromHash());
  const [view, setView] = useState<GameView | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed">("idle");
  const [toast, setToast] = useState("");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [targetId, setTargetId] = useState<PlayerId | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!view) return;
    const handIds = new Set(view.self.hand.map((card) => card.id));
    setSelectedCardIds((current) => current.filter((id) => handIds.has(id)));
    if (targetId && !view.players.some((player) => player.id === targetId && player.alive)) {
      setTargetId(null);
    }
  }, [targetId, view]);

  function connect(initialMessage: Record<string, unknown>) {
    socketRef.current?.close();
    localStorage.setItem(PLAYER_NAME_KEY, name.trim() || "无名客");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    socketRef.current = socket;
    setStatus("connecting");
    setToast("");

    socket.onopen = () => {
      setStatus("connected");
      socket.send(JSON.stringify(initialMessage));
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "joined") {
        window.location.hash = `room=${message.roomCode}`;
        setRoomCodeInput(message.roomCode);
        return;
      }
      if (message.type === "state") {
        setView(message.view);
        return;
      }
      if (message.type === "error") {
        setToast(message.message);
      }
      if (message.type === "kicked") {
        setToast(message.message);
        setView(null);
        window.location.hash = "";
        socket.close();
      }
    };

    socket.onclose = () => {
      setStatus("closed");
    };

    socket.onerror = () => {
      setToast("连接失败，请确认服务正在运行。");
    };
  }

  function createRoom() {
    connect({
      type: "createRoom",
      playerId,
      name
    });
  }

  function joinRoom() {
    connect({
      type: "joinRoom",
      roomCode: normalizeRoomCode(roomCodeInput),
      playerId,
      name
    });
  }

  function sendAction(action: Record<string, unknown>) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setToast("连接已断开。");
      return;
    }
    socket.send(JSON.stringify(action));
  }

  function leaveRoom() {
    socketRef.current?.close();
    socketRef.current = null;
    setView(null);
    setSelectedCardIds([]);
    setTargetId(null);
    window.location.hash = "";
    setStatus("idle");
  }

  if (!view) {
    return (
      <EntryScreen
        name={name}
        roomCode={roomCodeInput}
        status={status}
        onNameChange={setName}
        onRoomCodeChange={(value) => setRoomCodeInput(normalizeRoomCode(value))}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
      />
    );
  }

  return (
    <GameShell
      view={view}
      status={status}
      selectedCardIds={selectedCardIds}
      targetId={targetId}
      toast={toast}
      onLeave={leaveRoom}
      onToast={setToast}
      onSelectCard={(cardId, additive) => {
        setSelectedCardIds((current) => {
          if (additive) {
            return current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId];
          }
          return current.includes(cardId) && current.length === 1 ? [] : [cardId];
        });
      }}
      onSelectTarget={setTargetId}
      onAction={sendAction}
    />
  );
}

interface EntryScreenProps {
  name: string;
  roomCode: string;
  status: string;
  onNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

function EntryScreen(props: EntryScreenProps) {
  const canJoin = normalizeRoomCode(props.roomCode).length === 4;
  return (
    <main className="entry-shell">
      <section className="entry-visual" aria-hidden="true">
        <div className="fan-card fan-card-a">杀</div>
        <div className="fan-card fan-card-b">闪</div>
        <div className="fan-card fan-card-c">桃</div>
        <div className="seal-mark">群雄</div>
      </section>

      <section className="entry-panel">
        <p className="eyebrow">局域网联机卡牌局</p>
        <h1>群雄牌局</h1>
        <p className="entry-copy">开一个房间，朋友输入房间码加入；服务端负责发牌、身份隐藏、响应和胜负结算。</p>

        <label className="field">
          <span>昵称</span>
          <input value={props.name} maxLength={12} placeholder="输入你的名字" onChange={(event) => props.onNameChange(event.target.value)} />
        </label>

        <div className="entry-actions">
          <button className="primary-button" type="button" onClick={props.onCreateRoom}>
            <Play aria-hidden="true" />
            创建房间
          </button>
        </div>

        <div className="join-row">
          <label className="field">
            <span>房间码</span>
            <input
              value={props.roomCode}
              maxLength={4}
              placeholder="例如 Q7K2"
              onChange={(event) => props.onRoomCodeChange(event.target.value)}
            />
          </label>
          <button className="icon-text-button" type="button" disabled={!canJoin} onClick={props.onJoinRoom}>
            <LogIn aria-hidden="true" />
            加入
          </button>
        </div>

        <p className="connection-note">
          <Wifi aria-hidden="true" />
          {props.status === "connecting" ? "正在连接牌桌..." : "启动后用同一个地址邀请朋友。"}
        </p>
      </section>
    </main>
  );
}

interface GameShellProps {
  view: GameView;
  status: string;
  selectedCardIds: string[];
  targetId: PlayerId | null;
  toast: string;
  onLeave: () => void;
  onToast: (message: string) => void;
  onSelectCard: (cardId: string, additive: boolean) => void;
  onSelectTarget: (playerId: PlayerId) => void;
  onAction: (action: Record<string, unknown>) => void;
}

function GameShell(props: GameShellProps) {
  const { view, selectedCardIds, targetId } = props;
  const selectedCards = useMemo(
    () => view.self.hand.filter((card) => selectedCardIds.includes(card.id)),
    [selectedCardIds, view.self.hand]
  );
  const selectedCard = selectedCards[0] ?? null;
  const activePlayer = view.players.find((player) => player.id === view.activePlayerId) ?? null;
  const isMyTurn = view.phase === "playing" && view.stage === "play" && view.activePlayerId === view.selfId && !view.pending;
  const isMyDiscard = view.phase === "playing" && view.stage === "discard" && view.activePlayerId === view.selfId;
  const discardNeed = Math.max(0, view.self.handCount - Math.max(0, view.self.hp));
  const target = view.players.find((player) => player.id === targetId) ?? null;

  function playSelectedCard() {
    if (!selectedCard) return;
    props.onAction({
      type: "playCard",
      cardId: selectedCard.id,
      targetId: targetId ?? undefined
    });
  }

  function playSelectedCardAs(as: CardUseAs) {
    if (!selectedCard) return;
    props.onAction({
      type: "playCardAs",
      cardId: selectedCard.id,
      as,
      targetId: targetId ?? undefined
    });
  }

  function useSkill() {
    props.onAction({
      type: "useSkill",
      cardIds: selectedCardIds,
      targetId: targetId ?? undefined
    });
  }

  function respond() {
    if (!selectedCard) return;
    props.onAction({ type: "respond", cardId: selectedCard.id });
  }

  return (
    <main className="game-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">房间 {view.roomCode}</p>
          <h1>群雄牌局</h1>
        </div>
        <div className="top-actions">
          <StatusPill status={props.status} />
          <span className="mode-pill">{view.mode.shortName}</span>
          <DeadlinePill view={view} />
          <button
            className="icon-button"
            type="button"
            aria-label="复制邀请链接"
            title="复制邀请链接"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              props.onToast("邀请链接已复制。");
            }}
          >
            <Copy aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" aria-label="离开房间" title="离开房间" onClick={props.onLeave}>
            <DoorOpen aria-hidden="true" />
          </button>
        </div>
      </header>

      {view.phase === "lobby" && <Lobby view={view} onAction={props.onAction} />}
      {view.phase === "heroSelect" && <HeroSelect view={view} onAction={props.onAction} />}
      {(view.phase === "playing" || view.phase === "finished") && (
        <>
          <section className={`table-layout mode-${view.mode.id}`}>
            <aside className="side-panel">
              <RolePanel view={view} />
              <DeckPanel view={view} activePlayer={activePlayer} />
            </aside>

            <section className="battlefield">
              <PendingBanner pending={view.pending} players={view.players} selfId={view.selfId} />
              <EffectLayer view={view} />
              <div className={`players-grid players-${view.players.length}`}>
                {view.players.map((player) => (
                  <PlayerSeat
                    key={player.id}
                    player={player}
                    modeId={view.mode.id}
                    isSelf={player.id === view.selfId}
                    isActive={player.id === view.activePlayerId}
                    isTarget={player.id === targetId}
                    onClick={() => {
                      if (player.id !== view.selfId && player.alive) props.onSelectTarget(player.id);
                    }}
                  />
                ))}
              </div>
              {view.phase === "finished" && (
                <div className="result-banner">
                  <Crown aria-hidden="true" />
                  <strong>{view.winner} 获胜</strong>
                  <span>{view.finishReason}</span>
                  {view.self.isHost && (
                    <button className="result-reset" type="button" onClick={() => props.onAction({ type: "resetToLobby" })}>
                      <RotateCcw aria-hidden="true" />
                      再开一局
                    </button>
                  )}
                </div>
              )}
            </section>

            <aside className="side-panel log-panel">
              <h2>战报</h2>
              <div className="log-list">
                {view.log.map((entry) => (
                  <p key={entry.id}>{entry.text}</p>
                ))}
              </div>
            </aside>
          </section>

          <footer className="hand-dock">
            <div className="hand-header">
              <div>
                <strong>你的手牌</strong>
                <span>
                  {view.self.handCount} 张，体力 {Math.max(view.self.hp, 0)}/{view.self.maxHp}
                </span>
              </div>
              <div className="target-readout">{target ? `目标：${target.name}` : "未选择目标"}</div>
            </div>

            <div className="hand-row">
              {view.self.hand.map((card) => (
                <HandCard
                  key={card.id}
                  card={card}
                  selected={selectedCardIds.includes(card.id)}
                  onClick={(event) => props.onSelectCard(card.id, event.shiftKey || isMyDiscard)}
                />
              ))}
            </div>

            <ActionBar
              view={view}
              selectedCards={selectedCards}
              targetId={targetId}
              isMyTurn={isMyTurn}
              isMyDiscard={isMyDiscard}
              discardNeed={discardNeed}
              onPlay={playSelectedCard}
              onPlayAs={playSelectedCardAs}
              onSkill={useSkill}
              onRespond={respond}
              onPass={() => props.onAction({ type: "passPending" })}
              onEndPlay={() => props.onAction({ type: "endPlay" })}
              onDiscard={() => props.onAction({ type: "discard", cardIds: selectedCardIds })}
            />
          </footer>
        </>
      )}

      {props.toast && (
        <div className="toast" role="status">
          {props.toast}
        </div>
      )}
    </main>
  );
}

function Lobby({ view, onAction }: { view: GameView; onAction: (action: Record<string, unknown>) => void }) {
  const isHost = view.selfId === view.hostId;
  const nextMode = getModeForPlayerCount(view.players.length);
  return (
    <section className="lobby-layout">
      <div className="lobby-hero">
        <p className="eyebrow">等待开局</p>
        <h2>{view.players.length}/8 人已入座</h2>
        <p>{nextMode.description}</p>
        <div className="mode-card">
          <span>{nextMode.playerText}</span>
          <strong>{nextMode.name}</strong>
          <em>{nextMode.publicRoles ? "身份公开" : "身份暗置"}</em>
        </div>
        <button className="primary-button" type="button" disabled={!isHost || view.players.length < 2} onClick={() => onAction({ type: "startGame" })}>
          <Play aria-hidden="true" />
          开始牌局
        </button>
      </div>
      <div className="lobby-list">
        {view.players.map((player) => (
          <div key={player.id} className="lobby-player">
            <span>{player.seat + 1}</span>
            <strong>{player.name}</strong>
            {player.isHost && <Crown aria-hidden="true" />}
            {!player.online && <em>离线</em>}
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroSelect({ view, onAction }: { view: GameView; onAction: (action: Record<string, unknown>) => void }) {
  const role = view.self.role;
  const takenHeroIds = new Set(view.players.map((player) => player.heroId).filter((heroId): heroId is string => Boolean(heroId)));
  return (
    <section className="hero-select-layout">
      <div className="role-card">
        <p className="eyebrow">你的身份</p>
        <h2>{getRoleLabel(role, view.mode.id)}</h2>
        <p>{getRoleGoal(role, view.mode.id)}</p>
        <div className="mode-card compact">
          <span>{view.mode.playerText}</span>
          <strong>{view.mode.name}</strong>
          <em>{view.mode.publicRoles ? "全员可见" : "暗中博弈"}</em>
        </div>
      </div>
      <div className="hero-options">
        {view.self.heroOptions.map((heroId) => {
          const hero = getHero(heroId);
          if (!hero) return null;
          const selected = view.self.heroId === hero.id;
          const takenByOther = takenHeroIds.has(hero.id) && !selected;
          return (
            <button
              key={hero.id}
              className={["hero-option", selected ? "selected" : "", takenByOther ? "taken" : ""].filter(Boolean).join(" ")}
              type="button"
              disabled={takenByOther || Boolean(view.self.heroId)}
              style={{ "--kingdom": KINGDOM_COLORS[hero.kingdom] } as CSSProperties}
              onClick={() => onAction({ type: "chooseHero", heroId: hero.id })}
            >
              <span>{KINGDOM_LABELS[hero.kingdom]}</span>
              <strong>{hero.name}</strong>
              <em>{hero.title}</em>
              <p>{hero.skillName}：{hero.skillText}</p>
              <small>{SKILL_KIND_LABELS[hero.skillKind]}</small>
              {takenByOther && <b>已被选择</b>}
            </button>
          );
        })}
      </div>
      <div className="ready-list">
        {view.players.map((player) => (
          <div key={player.id}>
            {player.ready ? <Check aria-hidden="true" /> : <XCircle aria-hidden="true" />}
            <span>{player.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RolePanel({ view }: { view: GameView }) {
  const role = view.self.role;
  const hero = getHero(view.self.heroId);
  return (
    <section className="info-panel">
      <p className="eyebrow">你的信息</p>
      <h2>{getRoleLabel(role, view.mode.id)}</h2>
      <p>{getRoleGoal(role, view.mode.id)}</p>
      {hero && (
        <div className="skill-box">
          <strong>
            {hero.name} · {hero.skillName}
            <em>{SKILL_KIND_LABELS[hero.skillKind]}</em>
          </strong>
          <span>{hero.skillText}</span>
        </div>
      )}
    </section>
  );
}

function DeckPanel({ view, activePlayer }: { view: GameView; activePlayer: PublicPlayerView | null }) {
  return (
    <section className="info-panel compact-info">
      <p>
        <strong>玩法</strong>
        <span>{view.mode.name}</span>
      </p>
      <p>
        <strong>当前回合</strong>
        <span>{activePlayer ? activePlayer.name : "等待"}</span>
      </p>
      <p>
        <strong>回合数</strong>
        <span>{view.turnNumber}</span>
      </p>
      <p>
        <strong>牌堆</strong>
        <span>{view.deckCount}</span>
      </p>
      <p>
        <strong>弃牌</strong>
        <span>{view.discardCount}</span>
      </p>
    </section>
  );
}

function PlayerSeat(props: {
  player: PublicPlayerView;
  modeId: GameView["mode"]["id"];
  isSelf: boolean;
  isActive: boolean;
  isTarget: boolean;
  onClick: () => void;
}) {
  const hero = getHero(props.player.heroId);
  const roleLabel = props.player.role ? getRoleLabel(props.player.role, props.modeId) : "身份隐藏";
  const hpSlots = Array.from({ length: Math.max(props.player.maxHp, 1) }, (_, index) => index);
  return (
    <button
      className={[
        "player-seat",
        props.isSelf ? "self" : "",
        props.isActive ? "active" : "",
        props.isTarget ? "targeted" : "",
        !props.player.alive ? "dead" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      type="button"
      onClick={props.onClick}
    >
      <div className="portrait" style={{ "--kingdom": hero ? KINGDOM_COLORS[hero.kingdom] : "#777" } as CSSProperties}>
        <span>{hero ? hero.name.slice(0, 1) : "?"}</span>
      </div>
      <div className="seat-body">
        <div className="seat-title">
          <strong>{props.player.name}</strong>
          {props.player.isHost && <Crown aria-hidden="true" />}
        </div>
        <span className="hero-line">{hero ? `${KINGDOM_LABELS[hero.kingdom]} · ${hero.name}` : "未选武将"}</span>
        <span className="role-chip">{roleLabel}</span>
        <div className="hp-row">
          {hpSlots.map((slot) => (
            <i key={slot} className={slot < props.player.hp ? "filled" : ""} />
          ))}
        </div>
        <div className="seat-meta">
          <span>手牌 {props.player.handCount}</span>
          {props.player.equipment.weapon && <span>武器 {props.player.equipment.weapon.name}</span>}
          {props.player.equipment.armor && <span>防具 {props.player.equipment.armor.name}</span>}
        </div>
      </div>
    </button>
  );
}

function PendingBanner({ pending, players, selfId }: { pending: PendingAction | null; players: PublicPlayerView[]; selfId: PlayerId }) {
  if (!pending) {
    return (
      <div className="pending-banner idle">
        <Sparkles aria-hidden="true" />
        <span>等待当前玩家行动</span>
      </div>
    );
  }

  const nameOf = (id: PlayerId) => players.find((player) => player.id === id)?.name ?? "未知角色";
  let text = "";
  if (pending.kind === "dodge") {
    const remaining = Math.max(1, pending.required - pending.received);
    text = `${nameOf(pending.targetId)} 需要出 ${remaining} 张【闪】响应 ${nameOf(pending.sourceId)} 的【杀】。`;
  }
  if (pending.kind === "duel") text = `${nameOf(pending.currentResponderId)} 需要在【决斗】中打出【杀】。`;
  if (pending.kind === "aoe") {
    const targetId = pending.targetIds[pending.index];
    text = `${nameOf(targetId)} 需要打出【${pending.response === "strike" ? "杀" : "闪"}】响应群体锦囊。`;
  }
  if (pending.kind === "dying") text = `${nameOf(pending.targetId)} 濒死，需要 ${pending.needed} 张【桃】救援。`;

  const mine =
    (pending.kind === "dodge" && pending.targetId === selfId) ||
    (pending.kind === "duel" && pending.currentResponderId === selfId) ||
    (pending.kind === "aoe" && pending.targetIds[pending.index] === selfId) ||
    pending.kind === "dying";

  return (
    <div className={mine ? "pending-banner urgent" : "pending-banner"}>
      <Shield aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function EffectLayer({ view }: { view: GameView }) {
  const lastEffectId = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const effect = view.latestEffect;

  useEffect(() => {
    if (!effect || effect.id === lastEffectId.current) return;
    lastEffectId.current = effect.id;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(timer);
  }, [effect?.id]);

  if (!effect || !visible) return null;
  const source = effect.sourceId ? view.players.find((player) => player.id === effect.sourceId) : null;
  const target = effect.targetId ? view.players.find((player) => player.id === effect.targetId) : null;
  return (
    <div className={`effect-burst ${effect.kind}`} key={effect.id}>
      <span>{source ? source.name : "全场"}{target && target.id !== source?.id ? ` → ${target.name}` : ""}</span>
      <strong>{effect.title}</strong>
      <em>{effect.text}</em>
    </div>
  );
}

function DeadlinePill({ view }: { view: GameView }) {
  const deadline = view.phase === "heroSelect" ? view.heroSelectEndsAt : view.actionDeadlineAt;
  const seconds = useCountdownSeconds(deadline);
  if (seconds === null) return null;
  const label = view.phase === "heroSelect" ? "选将" : view.pending ? "响应" : view.stage === "discard" ? "弃牌" : "出牌";
  return <span className={seconds <= 3 ? "deadline-pill urgent" : "deadline-pill"}>{label} {seconds}s</span>;
}

function HandCard({ card, selected, onClick }: { card: GameCard; selected: boolean; onClick: (event: React.MouseEvent) => void }) {
  return (
    <button className={selected ? "hand-card selected" : "hand-card"} type="button" onClick={onClick}>
      <span className={card.color === "red" ? "card-corner red" : "card-corner"}>
        {card.rank}
        {suitSymbol(card.suit)}
      </span>
      <strong>{card.name}</strong>
      <em>{card.type === "basic" ? "基本" : card.type === "trick" ? "锦囊" : "装备"}</em>
      <p>{card.description}</p>
    </button>
  );
}

function ActionBar(props: {
  view: GameView;
  selectedCards: GameCard[];
  targetId: PlayerId | null;
  isMyTurn: boolean;
  isMyDiscard: boolean;
  discardNeed: number;
  onPlay: () => void;
  onPlayAs: (as: CardUseAs) => void;
  onSkill: () => void;
  onRespond: () => void;
  onPass: () => void;
  onEndPlay: () => void;
  onDiscard: () => void;
}) {
  const selectedCount = props.selectedCards.length;
  const pending = props.view.pending;
  const selectedCard = props.selectedCards[0] ?? null;
  const canRespond = Boolean(pending && selectedCount === 1 && canSelfRespond(props.view, pending));
  const canPass = Boolean(pending && canSelfRespond(props.view, pending, true));
  const canUseActiveSkill = props.isMyTurn && !props.view.self.skillUsed && canUseSelectedActiveSkill(props.view, props.selectedCards, props.targetId);
  const canPlayAsStrike = Boolean(
    props.isMyTurn &&
      selectedCard &&
      selectedCard.key !== "strike" &&
      canConvertCardAs(props.view.self.heroId, selectedCard, "strike")
  );
  const canPlayAsPeach = Boolean(
    props.isMyTurn &&
      selectedCard &&
      selectedCard.key !== "peach" &&
      props.view.self.hp < props.view.self.maxHp &&
      canConvertCardAs(props.view.self.heroId, selectedCard, "peach")
  );

  if (props.view.phase === "finished") {
    return (
      <div className="action-bar">
        <button className="secondary-button" type="button" onClick={() => props.view.self.isHost && props.onEndPlay()} disabled>
          牌局已结束
        </button>
      </div>
    );
  }

  return (
    <div className="action-bar">
      {props.isMyTurn && (
        <>
          <button className="primary-button" type="button" disabled={selectedCount !== 1} onClick={props.onPlay}>
            <Swords aria-hidden="true" />
            按牌面使用
          </button>
          <button className="secondary-button" type="button" disabled={!canPlayAsStrike} onClick={() => props.onPlayAs("strike")}>
            <Swords aria-hidden="true" />
            当杀使用
          </button>
          <button className="secondary-button" type="button" disabled={!canPlayAsPeach} onClick={() => props.onPlayAs("peach")}>
            <HeartPulse aria-hidden="true" />
            当桃使用
          </button>
          <button className="secondary-button" type="button" disabled={!canUseActiveSkill} onClick={props.onSkill}>
            <Sparkles aria-hidden="true" />
            发动主动技
          </button>
          <button className="ghost-button" type="button" onClick={props.onEndPlay}>
            <SkipForward aria-hidden="true" />
            结束出牌
          </button>
        </>
      )}

      {props.isMyDiscard && (
        <button className="primary-button" type="button" disabled={selectedCount !== props.discardNeed} onClick={props.onDiscard}>
          <Send aria-hidden="true" />
          弃置 {props.discardNeed} 张
        </button>
      )}

      {pending && (
        <>
          <button className="primary-button" type="button" disabled={!canRespond} onClick={props.onRespond}>
            <HeartPulse aria-hidden="true" />
            响应
          </button>
          <button className="ghost-button" type="button" disabled={!canPass} onClick={props.onPass}>
            <SkipForward aria-hidden="true" />
            跳过
          </button>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={status === "connected" ? "status-pill connected" : "status-pill"}>
      <Wifi aria-hidden="true" />
      {status === "connected" ? "在线" : status === "connecting" ? "连接中" : "离线"}
    </span>
  );
}

function canConvertCardAs(heroId: string | null, card: GameCard, as: CardUseAs) {
  if (as === "strike" && heroId === "guan-yu" && card.color === "red") return true;
  if (heroId === "zhao-yun") {
    if (as === "strike" && card.key === "dodge") return true;
    if (as === "dodge" && card.key === "strike") return true;
  }
  if (as === "peach" && heroId === "hua-tuo" && card.color === "red") return true;
  return false;
}

function canUseSelectedActiveSkill(view: GameView, selectedCards: GameCard[], targetId: PlayerId | null) {
  const heroId = view.self.heroId;
  const selectedCount = selectedCards.length;
  const target = targetId ? view.players.find((player) => player.id === targetId && player.id !== view.selfId && player.alive) : null;
  if (heroId === "liu-bei") return selectedCount === 1 && Boolean(target && target.hp < target.maxHp);
  if (heroId === "sun-quan") return selectedCount > 0;
  if (heroId === "zhang-liao") return selectedCount === 0 && Boolean(target);
  if (heroId === "sima-yi") return selectedCount === 1 && selectedCards[0].color === "black";
  if (heroId === "diao-chan") return selectedCount === 1 && Boolean(target);
  if (heroId === "xu-chu") return selectedCount === 2;
  return false;
}

function useCountdownSeconds(deadlineAt: number | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadlineAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);

  if (!deadlineAt) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

function canSelfRespond(view: GameView, pending: PendingAction, allowPass = false) {
  if (pending.kind === "dodge") return pending.targetId === view.selfId;
  if (pending.kind === "duel") return pending.currentResponderId === view.selfId;
  if (pending.kind === "aoe") return pending.targetIds[pending.index] === view.selfId;
  if (pending.kind === "dying") return allowPass ? !pending.passedPlayerIds.includes(view.selfId) : view.self.alive;
  return false;
}

function loadPlayerId() {
  const existing = localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function getRoomFromHash() {
  const raw = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(raw);
  return normalizeRoomCode(params.get("room") ?? "");
}

function suitSymbol(suit: GameCard["suit"]) {
  if (suit === "spade") return "♠";
  if (suit === "heart") return "♥";
  if (suit === "club") return "♣";
  return "♦";
}
