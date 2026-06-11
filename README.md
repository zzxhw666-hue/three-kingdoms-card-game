# 群雄牌局

一个“三国时期身份卡牌局”网页原型，适合和朋友开房游玩。玩法参考身份杀的核心结构：隐藏身份、主公公开、出牌阶段、杀闪响应、桃救援、锦囊结算和简化武将技。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:5466` 创建房间。朋友在同一网络里访问你的电脑 IP 和端口，例如 `http://你的局域网IP:5466`，再输入房间码加入。

## 发布成公网网址

这个项目需要 WebSocket 服务来同步房间状态，所以不能只用 GitHub Pages。GitHub Pages 只能托管静态 HTML/CSS/JS，不能运行这个 Node 房间服务。

推荐路线：

1. 在 GitHub 新建仓库，把 `three-kingdoms-card-game` 目录推上去。
2. 打开 Render，创建 Web Service，连接这个 GitHub 仓库。
3. Render 会读取 `render.yaml`；也可以手动填：
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
4. 部署完成后，Render 会生成 `https://你的服务名.onrender.com`，把这个链接发给朋友即可。

也可以用 Docker 部署，仓库里已经带了 `Dockerfile`。

## 人数玩法

- 2 人：双雄对决。身份公开，主将对挑战者，先击败对手者获胜；先手第一回合少摸一张。
- 3 人：三方乱战。身份公开，主将、破军、游侠目标不同。
- 4-8 人：身份暗战。主公公开，其余身份隐藏到阵亡或结算。

## 规则位置

- `src/game/content.ts`：武将、身份说明、卡牌配置。这里写了中文注释，后面加牌或改技能主要改这里。
- `src/game/engine.ts`：服务端裁判逻辑。这里处理发牌、回合、响应、伤害、濒死、胜负等规则。
- `server/index.ts`：房间和 WebSocket 消息协议。
- `src/App.tsx`：玩家界面和交互。
- `render.yaml`：Render 从 GitHub 自动部署时使用的服务配置。

## 已支持

- 2-8 人房间，按人数自动切换玩法
- 主公、忠臣、反贼、内奸身份分配
- 主公身份公开，其余身份隐藏到阵亡或结束
- 武将候选和选将
- 基本牌：杀、闪、桃
- 锦囊：无中生有、过河拆桥、顺手牵羊、决斗、南蛮入侵、万箭齐发、桃园结义
- 装备：长兵、连弩、明光铠
- 濒死出桃救援
- 简化武将技：曹操、刘备、孙权、关羽、张飞、赵云、周瑜、华佗

## 检查

```bash
npm test
npm run build
```
