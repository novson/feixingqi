# 在线飞行棋

2–8 人实时在线飞行棋。房间约局、AI 补位、掉线自动托管。**不设账号密码 —— 填个昵称就能进房间开玩**（昵称存在浏览器本地，刷新/重连自动回座）。

## 已实现

- **棋盘**：经典十字飞行棋盘（还原参考图）—— 56 格外圈排成正方形，四角是各队停机坪（机库），
  四条飞机场虚线穿心而过，终点通道从四角内侧斜插进中心四色大本营，天空渐变 + 云朵背景
- **规则**：掷 6 起飞并连掷（最多 3 次）、落在同色格跳到下一个同色格、落在飞机场沿虚线飞半圈再跳、撞子送回机库、终点需精确点数
- **人数**：2–8 人同局，起飞点按人数沿外圈等距分布（4 人局正好落在四个角）；8 色机队
- **房间**：4 位房间码加入、房主开局、大厅增减 AI、观战、局中离房自动交 AI 托管
- **实时**：WebSocket 推送整局快照，断线自动重连；回合超时自动行动（默认 25 秒，离线玩家 5 秒托管）
- **无账号**：昵称 1–16 字即入座，座位身份用 `playerId + reconnectToken` 记在本地，刷新页面自动回座

## 一键启动

```bash
docker compose up -d --build
```

浏览器打开 `http://服务器IP:8080`。停止：`docker compose down`。

## 本地开发

要求 Node.js 20+：

```bash
cd server && npm install && npm run dev     # 后端 :8080，同时托管已构建的 web/dist
cd web && npm install && npm run dev        # 前端 :5173，代理 /api 与 /ws 到 8080
```

只跑前端时后端也要开着（接口和 WebSocket 都在 8080）。

## 测试与构建

```bash
cd server && npm test
cd web && npm test && npm run build
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8080 | 服务端口 |
| `FLY_ALLOWED_ORIGINS` | `*` | CORS 允许来源，逗号分隔 |
| `FLY_TURN_SECONDS` | 25 | 玩家回合时限（秒），超时自动行动 |
| `FLY_AWAY_SECONDS` | 5 | 离线玩家托管前的等待（秒） |
| `FLY_AI_THINK_MS` | 900 | AI 出手思考时间（毫秒） |

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/rooms` | 房间列表 |
| POST | `/api/rooms` | 创建房间（body 带 `hostNickname`） |
| POST | `/api/rooms/{id}/join` | 加入房间（body 带 `nickname`） |
| GET | `/api/rooms/{id}` | 房间完整状态 |
| POST | `/api/rooms/{id}/ai` | 房主调整 AI 数量 |
| POST | `/api/rooms/{id}/start` | 开局 |
| POST | `/api/rooms/{id}/roll` | 掷骰 |
| POST | `/api/rooms/{id}/move` | 走子（body 带 `plane`） |
| POST | `/api/rooms/{id}/leave` | 离房 |
| POST | `/api/rooms/{id}/resume` | 刷新页面后回到座位 |
| WS | `/ws` | 订阅 `{t:'sub', roomId}`，接收 `{t:'state', room}` |

## 服务器部署（139.224.254.109）

与已有的 poker-game 共存：共用 nginx 的 80 端口，用 `/feixingqi/` 路径前缀区分，
poker 仍然占用 `/`、`/api/`、`/ws`。飞行棋只监听 `127.0.0.1:18090`，不开新的公网端口。

| 项目 | 位置 |
|---|---|
| 程序 | `/opt/feixingqi/server`、`/opt/feixingqi/web/dist` |
| 运行用户 | `feixingqi` |
| 监听 | `127.0.0.1:18090` |
| systemd | `/etc/systemd/system/feixingqi.service`（开机自启 + `Restart=always` 故障自动拉起） |
| nginx | `/etc/nginx/default.d/feixingqi.conf`（`/feixingqi/` → 静态，`/feixingqi/api/`、`/feixingqi/ws` → 反代） |

访问地址：**http://139.224.254.109/feixingqi/**

常用命令：

```bash
systemctl status feixingqi      # 看状态
systemctl restart feixingqi     # 重启
journalctl -u feixingqi -f      # 看日志
nginx -t && systemctl reload nginx   # 改完 nginx 配置后优雅重载
```

服务由 systemd 托管，不用 `nohup` / 手动后台进程：`Restart=always`（崩溃、被杀、
异常退出都会自动拉起，间隔 3 秒）、`StartLimitBurst=10 / 5 分钟`（连续失败 10 次才放弃，
避免死循环重启）、`MemoryMax=512M`、`enabled` 开机自启。实测 `kill -9` 后 3 秒内自动恢复。

改完代码后一条命令更新（会跑前端测试、构建、上传、重启）：

```bash
./deploy/deploy.sh
```

手动部署时前端要按子路径构建，否则资源路径会 404：

```bash
cd web && npm run build -- --mode subpath
```

## 项目结构

```text
server/   Node 后端：规则引擎（rules.js）、对局状态机（game.js）、房间编排与 AI（rooms.js/ai.js）
web/      Vue 3 前端：昵称入口、大厅、SVG 棋盘（services/board.js 是几何的唯一来源）
Dockerfile / compose.yml  一键部署
```

## 规则细节

- 位置编码：`-1` 机库，`0–55` 外圈（相对自己起飞点），`56–61` 终点通道，`62` 到家
- 颜色：外圈格子按人数循环着色，跳棋距离 = 人数（4 人即经典 4 格，也可在房间设置里固定 4 格）
- 飞机场：每位玩家一侧的中段，飞过去正好半圈（28 格），落地后再前进一个同色间距
- 连掷：掷出 6 点可以继续掷，最多连续 3 次；第 3 次之后交出行动权
- 结束：默认第一位玩家全部飞机到家即结束，可改为打到只剩一人
