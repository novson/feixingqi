# 项目长期记忆：在线飞行棋（feixingqi）

## 定位与约束

- 2–8 人在线飞行棋，熟人约局场景。账号体系刻意对齐 `E:\user\github_project\poker-game`：无密码，昵称 + 跨设备登录码（12 位字母数字，可自定义 4 位数字），服务端只存 SHA-256，登录态 = `accountId + accountToken`（请求头 `X-Account-Token`）。
- **技术栈是 Node 全栈，不是 Java**：本机没有 JDK/Maven/Docker（只有 Node 22），所以没有沿用 poker-game 的 Spring Boot。不要在后续需求里默认写 Java。
- npm 安装一律加 `--registry=https://registry.npmmirror.com`，默认 registry 会卡死。

## 规则基线（改动前先确认）

- 棋盘 56 格外圈 + 6 格终点通道，`FINISH=62`，`HANGAR=-1`；位置全部是「相对自己起飞点」的整数。
- 掷 6 起飞并可连掷，最多连续 3 次；同色格跳棋（距离 = 玩家数，4 人即 4 格）；飞机场飞半圈（+28）后再跳一次；撞子回机库；终点要精确点数。
- 房间设置：`planesPerPlayer`（2–4）、`jumpMode`（AUTO / CLASSIC4）、`flyEnabled`、`endOnFirst`。

## 目录约定

- `server/src/`：`rules.js` 纯棋盘数学、`game.js` 状态机、`rooms.js` 编排（AI 托管/超时/战绩入库）、`accounts.js` 账号；测试在 `server/test/`，跑 `npm test`。
- `web/src/`：`services/board.js` 是棋盘几何的唯一来源，`components/GameBoard.vue` 只负责渲染；`services/rules.js` 与服务端常量保持一致（有重复，改要同步）。
- 生产由 Node 直接托管 `web/dist`。容器化走根目录 `Dockerfile` + `compose.yml`；实际线上走 systemd（见下）。

## 线上部署（139.224.254.109）

- 入口：`http://139.224.254.109/feixingqi/`，与 poker-game（占 `/`、`/api/`、`/ws`，后端 18080）共用 nginx 80 端口，靠路径前缀区分；飞行棋只听 `127.0.0.1:18090`，不开新公网端口。
- 路径：`/opt/feixingqi/{server,web/dist}`，用户 `feixingqi`，账号数据 `/var/lib/feixingqi/accounts.json`，单元 `feixingqi.service`，nginx 片段 `/etc/nginx/default.d/feixingqi.conf`（模板都在 `deploy/`）。
- 更新：`./deploy/deploy.sh`（前端必须用 `--mode subpath` 构建）。
- 动线上前先确认不碰 poker-game / searxng(8080) / openclaw(12040)；nginx 改完用 `reload` 而不是 `restart`。
- **服务一律 systemd 托管，禁止 nohup / 手动后台进程**：`Restart=always` + `RestartSec=3` + `StartLimitBurst=10`(5min) + `MemoryMax=512M` + `enabled`。单元模板在 `deploy/feixingqi.service`，改完要同步推送到 `/etc/systemd/system/` 并 `daemon-reload`。用户明确要求过这一点。
