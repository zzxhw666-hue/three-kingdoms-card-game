import type { CardDef, GameModeId, GameModeInfo, HeroDef, HeroSkillKind, RoleId } from "./types";

export const ROLE_LABELS: Record<RoleId, string> = {
  lord: "主公",
  loyalist: "忠臣",
  rebel: "反贼",
  renegade: "内奸"
};

export const ROLE_GOALS: Record<RoleId, string> = {
  lord: "保住自己，清除所有反贼和内奸。",
  loyalist: "保护主公，协助主公清除威胁。",
  rebel: "击败主公即可获胜。",
  renegade: "先让局势收束，最后成为场上唯一胜者。"
};

const DUEL_ROLE_LABELS: Record<RoleId, string> = {
  lord: "主将",
  loyalist: "援军",
  rebel: "挑战者",
  renegade: "游侠"
};

const DUEL_ROLE_GOALS: Record<RoleId, string> = {
  lord: "击败挑战者，成为最后站着的人。",
  loyalist: "协助主将取胜。",
  rebel: "击败主将即可获胜。",
  renegade: "成为最后站着的人。"
};

const SKIRMISH_ROLE_LABELS: Record<RoleId, string> = {
  lord: "主将",
  loyalist: "同盟",
  rebel: "破军",
  renegade: "游侠"
};

const SKIRMISH_ROLE_GOALS: Record<RoleId, string> = {
  lord: "在三方夹击中活下来，清除破军和游侠。",
  loyalist: "协助主将取胜。",
  rebel: "击败主将即可获胜。",
  renegade: "等局势收束后，成为最后胜者。"
};

export const GAME_MODES: Record<GameModeId, GameModeInfo> = {
  duel: {
    id: "duel",
    name: "双雄对决",
    shortName: "2人对战",
    playerText: "2 人",
    description: "身份公开，主将与挑战者正面对决；先击败对手者获胜。先手第一回合少摸一张，降低先手优势。",
    publicRoles: true,
    startingHand: 4,
    firstTurnDraw: 1,
    drawPerTurn: 2,
    heroOptions: 4,
    lordHeroOptions: 4,
    lordHpBonus: false,
    roleLabels: DUEL_ROLE_LABELS,
    roleGoals: DUEL_ROLE_GOALS
  },
  skirmish: {
    id: "skirmish",
    name: "三方乱战",
    shortName: "3人乱战",
    playerText: "3 人",
    description: "三名玩家目标不同，身份公开但胜负关系不对称：主将求稳，破军抢杀，游侠收残局。",
    publicRoles: true,
    startingHand: 4,
    firstTurnDraw: 2,
    drawPerTurn: 2,
    heroOptions: 3,
    lordHeroOptions: 4,
    lordHpBonus: false,
    roleLabels: SKIRMISH_ROLE_LABELS,
    roleGoals: SKIRMISH_ROLE_GOALS
  },
  identity: {
    id: "identity",
    name: "身份暗战",
    shortName: "多人身份局",
    playerText: "4-8 人",
    description: "主公公开，其余身份隐藏；反贼抢主公，忠臣护主公，内奸寻找最后一击。",
    publicRoles: false,
    startingHand: 4,
    firstTurnDraw: 2,
    drawPerTurn: 2,
    heroOptions: 3,
    lordHeroOptions: 4,
    lordHpBonus: true,
    roleLabels: ROLE_LABELS,
    roleGoals: ROLE_GOALS
  }
};

export function getModeForPlayerCount(playerCount: number) {
  if (playerCount <= 2) return GAME_MODES.duel;
  if (playerCount === 3) return GAME_MODES.skirmish;
  return GAME_MODES.identity;
}

export function getRoleLabel(role: RoleId | null | undefined, modeId: GameModeId) {
  if (!role) return "身份未明";
  return GAME_MODES[modeId].roleLabels[role];
}

export function getRoleGoal(role: RoleId | null | undefined, modeId: GameModeId) {
  if (!role) return "等待身份分配。";
  return GAME_MODES[modeId].roleGoals[role];
}

export const KINGDOM_LABELS = {
  wei: "魏",
  shu: "蜀",
  wu: "吴",
  qun: "群"
} as const;

export const KINGDOM_COLORS = {
  wei: "#3d6f9f",
  shu: "#3f8b4f",
  wu: "#b06a2b",
  qun: "#8e5a9d"
} as const;

export const SKILL_KIND_LABELS: Record<HeroSkillKind, string> = {
  active: "主动技",
  passive: "被动技",
  conversion: "转换技"
};

export const ROLE_SETS: Record<number, RoleId[]> = {
  2: ["lord", "rebel"],
  3: ["lord", "rebel", "renegade"],
  4: ["lord", "loyalist", "rebel", "renegade"],
  5: ["lord", "loyalist", "rebel", "rebel", "renegade"],
  6: ["lord", "loyalist", "loyalist", "rebel", "rebel", "renegade"],
  7: ["lord", "loyalist", "loyalist", "rebel", "rebel", "rebel", "renegade"],
  8: ["lord", "loyalist", "loyalist", "rebel", "rebel", "rebel", "rebel", "renegade"]
};

export const HEROES: HeroDef[] = [
  {
    id: "cao-cao",
    name: "曹操",
    title: "魏武挥鞭",
    kingdom: "wei",
    maxHp: 4,
    skillName: "归略",
    skillKind: "passive",
    skillText: "每次受到伤害后，若仍存活，摸一张牌。",
    quote: "乱世之局，先握在手中。"
  },
  {
    id: "liu-bei",
    name: "刘备",
    title: "仁主结义",
    kingdom: "shu",
    maxHp: 4,
    skillName: "仁望",
    skillKind: "active",
    skillText: "出牌阶段限一次：弃一张牌，令一名受伤角色回复 1 点体力。",
    quote: "同袍在侧，方有山河。"
  },
  {
    id: "sun-quan",
    name: "孙权",
    title: "江东少主",
    kingdom: "wu",
    maxHp: 4,
    skillName: "衡策",
    skillKind: "active",
    skillText: "出牌阶段限一次：弃任意张手牌，然后摸等量的牌。",
    quote: "权衡一瞬，江潮改道。"
  },
  {
    id: "guan-yu",
    name: "关羽",
    title: "赤心青锋",
    kingdom: "shu",
    maxHp: 4,
    skillName: "赤锋",
    skillKind: "conversion",
    skillText: "你可以将一张红色手牌当作【杀】使用。",
    quote: "赤胆向前，刀光不回。"
  },
  {
    id: "zhang-fei",
    name: "张飞",
    title: "燕人怒喝",
    kingdom: "shu",
    maxHp: 4,
    skillName: "长喝",
    skillKind: "passive",
    skillText: "你的出牌阶段使用【杀】没有次数限制。",
    quote: "战鼓未停，谁敢后退。"
  },
  {
    id: "zhao-yun",
    name: "赵云",
    title: "白马穿阵",
    kingdom: "shu",
    maxHp: 4,
    skillName: "游龙",
    skillKind: "conversion",
    skillText: "你可以将【闪】当作【杀】使用，也可以将【杀】当作【闪】响应。",
    quote: "枪影所至，进退皆路。"
  },
  {
    id: "zhou-yu",
    name: "周瑜",
    title: "江火雅量",
    kingdom: "wu",
    maxHp: 3,
    skillName: "英姿",
    skillKind: "passive",
    skillText: "摸牌阶段额外摸一张牌。",
    quote: "风起江面，火照连营。"
  },
  {
    id: "hua-tuo",
    name: "华佗",
    title: "青囊济世",
    kingdom: "qun",
    maxHp: 3,
    skillName: "青囊",
    skillKind: "conversion",
    skillText: "你可以将一张红色手牌当作【桃】使用或救援。",
    quote: "一线生机，也值得争。"
  }
];

export const CARDS: CardDef[] = [
  // 基本牌：构成每回合攻防节奏，数量最多，保证玩家经常有事可做。
  {
    key: "strike",
    name: "杀",
    type: "basic",
    target: "singleEnemy",
    count: 28,
    description: "出牌阶段对攻击范围内一名其他角色使用；目标需出【闪】，否则受到 1 点伤害。"
  },
  {
    key: "dodge",
    name: "闪",
    type: "basic",
    target: "none",
    count: 18,
    description: "响应【杀】或箭雨类效果，抵消一次即将受到的命中。"
  },
  {
    key: "peach",
    name: "桃",
    type: "basic",
    target: "self",
    count: 10,
    description: "出牌阶段令自己回复 1 点体力；也可在角色濒死时救援。"
  },

  // 锦囊牌：用较少的文字保留“拆、牵、摸、决斗、群体响应”的桌游味道。
  {
    key: "draw_two",
    name: "无中生有",
    type: "trick",
    target: "self",
    count: 4,
    description: "摸两张牌。"
  },
  {
    key: "dismantle",
    name: "过河拆桥",
    type: "trick",
    target: "singleAny",
    count: 5,
    description: "弃置一名其他角色的一张随机手牌；若其无手牌，则弃置其装备。"
  },
  {
    key: "steal",
    name: "顺手牵羊",
    type: "trick",
    target: "singleAny",
    count: 4,
    description: "获得一名其他角色的一张随机手牌。"
  },
  {
    key: "duel",
    name: "决斗",
    type: "trick",
    target: "singleEnemy",
    count: 3,
    description: "你与目标轮流打出【杀】；首先不出的角色受到对方造成的 1 点伤害。"
  },
  {
    key: "barbarian",
    name: "南蛮入侵",
    type: "trick",
    target: "allOthers",
    count: 2,
    description: "除你以外的所有角色依次需打出【杀】，否则受到 1 点伤害。"
  },
  {
    key: "arrows",
    name: "万箭齐发",
    type: "trick",
    target: "allOthers",
    count: 2,
    description: "除你以外的所有角色依次需打出【闪】，否则受到 1 点伤害。"
  },
  {
    key: "garden",
    name: "桃园结义",
    type: "trick",
    target: "allOthers",
    count: 2,
    description: "所有存活角色各回复 1 点体力。"
  },

  // 装备牌：第一版只保留武器距离和连击感，避免把判定牌系统一次做得过重。
  {
    key: "halberd",
    name: "长兵",
    type: "equip",
    target: "self",
    equipmentSlot: "weapon",
    range: 2,
    count: 3,
    description: "装备后攻击范围为 2。"
  },
  {
    key: "crossbow",
    name: "连弩",
    type: "equip",
    target: "self",
    equipmentSlot: "weapon",
    range: 1,
    count: 2,
    description: "装备后你的【杀】没有次数限制。"
  },
  {
    key: "war_armor",
    name: "明光铠",
    type: "equip",
    target: "self",
    equipmentSlot: "armor",
    count: 2,
    description: "装备后每回合第一次受到伤害时少受 1 点；第一版按简化防具处理。"
  }
];

export function getHero(heroId: string | null | undefined) {
  return HEROES.find((hero) => hero.id === heroId) ?? null;
}

export function getCardDef(key: string) {
  return CARDS.find((card) => card.key === key) ?? null;
}
