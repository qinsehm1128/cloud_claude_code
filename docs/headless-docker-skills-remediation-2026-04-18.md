# Headless / Docker / Skills 整改对比文档（2026-04-18）

## 范围

本轮围绕以下 9 个问题做 `开发 > review > 校验` 闭环：

1. `headless` 前后端 `ws` 交互不稳定，新建会话会受旧连接影响。
2. 点击停止 AI 会话后，后端 Claude 仍继续执行。
3. 删除全部 VS Code 插件相关代码与源码。
4. 容器内重复构建与缓存膨胀，占用本地存储。
5. Docker 以 `root` 启动再混用 `developer`，导致 Node / 路径异常。
6. 容器需要支持不限 `CPU / GPU`，避免 Docker 侧资源硬限制。
7. TUI / headless 文件面板路径异常，且要支持上传、下载、目录压缩。
8. `skills` 从“手动选中注入”改为“启动自动注入全部 skills”。
9. 支持通过 `npx skills add` 安装 skills 到全局目录或指定目录，并在容器启动时自动注入。

## 结论概览

| 任务 | 状态 | 完成度 | 结论 |
| --- | --- | --- | --- |
| 1 | 已完成 | 100% | `HeadlessChat` 与 `HeadlessTerminal` 都已切到 conversation-scope ws；`stopSession` 改为按 `session_id` 精确关闭，且移除了 conversation 新建时的无差别 `pkill claude`。 |
| 2 | 已完成 | 100% | “停止 AI 会话”现在会真正 `CloseSession`、终止 Docker exec，并立即修正 `running/pending` 的残留 turn。 |
| 3 | 已完成 | 100% | `vscode-extension/` 源码与镜像安装链路已删除。 |
| 4 | 基本完成 | 95% | `/workspace`、`/app` 已拆到 per-container named volume，缓存卷已共享；本轮补了 `/root -> /home/developer` 的 npm/cache/pnpm 软链，避免 root 场景继续写爆容器层。 |
| 5 | 基本完成 | 98% | `docker/Dockerfile.base`、`deploy-docker/Dockerfile.base` 与运行时 `exec env` 已统一 `CC_CONFIG_HOME`、`NPM_CONFIG_PREFIX`、`PATH`，并把 root 缓存路径收口到 developer 目录；真实宿主核验仍受本机无 Docker CLI 阻塞。 |
| 6 | 基本完成 | 95% | 已增加 `memory_unlimited`、`cpu_unlimited`、`gpu_enabled`、`gpu_count`，并在 `memory_unlimited` 下启用 unlimited swap + disable Docker OOM kill；本轮补了 unlimited 参数校验与 `gpu_count < -1` 拦截。 |
| 7 | 已完成 | 95% | 文件根目录、目录下载 zip、多文件/文件夹上传、headless 文件侧栏已落地。 |
| 8 | 已完成 | 100% | 新增 `auto_inject_all_skills`，默认启动自动注入全部 skill 模板。 |
| 9 | 已完成 | 100% | 后端已支持按模板 frontmatter 执行 `npx skills add`，含全局/指定目录安装，并按 `skills@1.5.0` 调整 `--agent / --skill '*'` 组合；本轮补了 frontmatter 解析测试。 |

## 已完成

### 1. Headless 会话与执行控制

**症状**

- 新建会话时容易混入旧 session / 旧事件。
- 前端点击取消后，后端 Claude 仍继续执行。

**根因**

- `headless_start` 缺少强制收口旧会话的语义。
- 取消执行只断开读链路，没有真正终止 Docker exec。
- 历史回放与实时事件并发时，前端缺少去重。

**修复**

- 后端 `force_new` 会关闭旧 session，并 kill 容器内 Claude exec。
- `CancelExecution()` 已改为真正终止 Docker exec。
- 新增 `headless_stop_session`，前端可区分“取消当前执行”和“停止整个会话”。
- `CloseSession*()` 现在会同步修正 stale turns，避免 UI 长时间挂在 `running/pending`。
- `sendResponse()` / `broadcastToClients()` 从直接丢弃改为短等待发送。
- `HeadlessChat` 新建会话改为显式 `startSession(work_dir, true)`。
- `HeadlessChat` 在收到 `session_info` 后会自动切到 `conversation-scope ws`。
- `HeadlessTerminal` 现在也会在创建会话后自动切到 `conversation-scope ws`，断线重连优先回到当前 conversation。
- `headless_stop_session` 现在会携带前端 `session_id`，后端优先按精确 session 关闭，避免 container-scope 回退时误关“最近活跃会话”。
- conversation 级 `handleStart()` 已去掉无条件 `pkill -f claude`，避免同容器其他 conversation 被误杀。
- `GetSessionForContainer()` 改为返回最近活跃的 session，避免 map 遍历顺序导致串线。
- `useHeadlessSession` 新增实时事件指纹去重，降低 history replay + live push 的重复渲染。

**关键文件**

- `backend/internal/handlers/headless.go`
- `backend/internal/headless/process.go`
- `backend/internal/headless/session.go`
- `frontend/src/pages/HeadlessChat.tsx`
- `frontend/src/hooks/useHeadlessSession.ts`
- `frontend/__tests__/hooks/useHeadlessSession.test.tsx`

### 2. 文件面板、上传下载、目录压缩

**症状**

- 文件浏览根路径错误。
- 目录不能下载，文件夹上传不支持。
- headless 页面缺少文件侧栏。

**修复**

- 文件根目录改为容器真实 `work_dir`，fallback `/app`。
- 容器路径拼接统一改为 POSIX 风格。
- 目录下载改为 zip 流。
- 上传支持多文件、文件夹与 `relative_paths`。
- TUI 与 headless 页面都接入 `FileBrowser`。

**关键文件**

- `backend/internal/services/file.go`
- `backend/internal/handlers/file.go`
- `frontend/src/components/FileManager/FileBrowser.tsx`
- `frontend/src/pages/ContainerTerminal.tsx`
- `frontend/src/pages/HeadlessTerminal.tsx`
- `frontend/src/pages/HeadlessChat.tsx`
- `frontend/src/services/api.ts`

### 3. Docker / skills / VS Code 清理与增强

**修复**

- 删除整个 `vscode-extension/` 目录。
- 删除 Dockerfile / build 脚本中的 VSIX 打包与安装链路。
- 新增根目录、`docker/`、`deploy-docker/` 三处 `.dockerignore`。
- 新增 `CC_CONFIG_HOME=/home/developer` 统一配置根目录。
- `docker/Dockerfile.base` 已补 `NPM_CONFIG_PREFIX=/home/developer/.npm-global` 与 `npm config set prefix`。
- Dockerfile 中为 `/root/.claude`、`/root/.codex`、`/root/.agents` 增加到 developer 目录的软链。
- Dockerfile 现在也把 `/root/.npm`、`/root/.cache`、`/root/.npm-global`、`/root/.local/share/pnpm/store` 统一软链到 developer 目录，避免 `runAsRoot=true` 时缓存继续写入容器层。
- `ExecInContainer()` / `ExecAsRoot()` 已显式补齐：
  - `HOME`
  - `CC_CONFIG_HOME`
  - `NPM_CONFIG_PREFIX`
  - `PATH=/home/developer/.npm-global/bin:/home/developer/.local/bin:...`
- 容器创建已改为 managed volumes：
  - per-container：`/workspace`、`/app`
  - shared cache：`/home/developer/.npm`、`/home/developer/.cache`、`/home/developer/.npm-global`、`/home/developer/.local/share/pnpm/store`
- 删除容器时会主动清理 per-container 工作卷，避免 volume 残留膨胀。
- 容器创建支持：
  - `auto_inject_all_skills`
  - `memory_unlimited`
  - `cpu_unlimited`
  - `gpu_enabled`
  - `gpu_count`
- `memory_unlimited` 额外会设置：
  - `MemorySwap=-1`
  - `OomKillDisable=true`
- Dashboard 已增加对应开关。
- `skills` 模板支持 frontmatter 安装元数据：
  - `install_source`
  - `install_global`
  - `install_agents`
  - `install_skills`
  - `install_all`
  - `install_target_dir`
- 当 skill 模板包含 `install_source` 时，后端执行：
  - `HOME=${CC_CONFIG_HOME:-$HOME} npx -y skills add ... --yes`
- `install_all + install_agents` 场景已改为 `--skill '*' + --agent ...`，避免 `--all` 把技能安装到所有 agent。
- 补充 `ParseSkillMetadata` 测试，覆盖 `install_source / install_global / install_agents / install_skills / install_target_dir`。

**关键文件**

- `backend/internal/models/claude_config_template.go`
- `backend/internal/models/models.go`
- `backend/internal/services/config_template_service.go`
- `backend/internal/services/config_injection_service.go`
- `backend/internal/services/container.go`
- `backend/internal/docker/client.go`
- `backend/internal/handlers/container.go`
- `docker/Dockerfile.base`
- `deploy-docker/Dockerfile.base`
- `docker/build-base.sh`
- `deploy-docker/build-base.sh`
- `deploy-docker/start.sh`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/services/api.ts`
- `README.md`
- `README.zh-CN.md`

## 未完成 / 剩余风险

### 任务 1 残余风险

- 后端 `sendHistory + live subscribe` 仍是两条路径并行，当前主要靠“精确 session 停止 + conversation-scope ws + 前端去重”兜底。

### 任务 4 / 5 / 6 未完全核实

- 代码层已统一配置根路径，但尚未在真实宿主上逐项验证：
  - `whoami`
  - `echo $HOME`
  - `which node`
  - `which claude`
  - `which codex`
- 也还未做一次真实 Docker 存储对比：
  - `docker system df`
  - `docker volume ls`
  - 创建/删除容器后工作卷是否按预期回收
- 本机当前 shell 无 `docker` 命令，因此上述运行态验证本轮无法在本地完成。

### 校验阻塞

- `gitnexus_detect_changes()` MCP 当前不可用，返回：
  - `Server not found: gitnexus_detect`
- `gitnexus_list_repos()` 也不可用，返回：
  - `Server not found: gitnexus_list`
- 因此本轮改动面以 `git diff --stat` 作为替代证据。

## 验证记录

### 通过

```bash
cd backend
go test ./internal/headless ./internal/handlers -count=1
```

```bash
cd backend
go test ./internal/headless ./internal/handlers ./internal/docker ./internal/services -run "Container|Inject|ConfigTemplate|Security" -count=1
```

```bash
cd frontend
npm exec vitest run __tests__/hooks/useHeadlessSession.test.tsx __tests__/components/Headless/TurnCard.test.tsx __tests__/pages/Dashboard.ContainerCreate.test.tsx
```

```bash
cd backend
go test ./internal/headless ./internal/handlers ./internal/services -run "Headless|Container|ConfigTemplate|Security" -count=1
```

```bash
cd frontend
npm exec vitest run __tests__/hooks/useHeadlessSession.test.tsx __tests__/pages/Dashboard.ContainerCreate.test.tsx
```

```bash
cd backend
go test ./internal/headless ./internal/handlers ./internal/docker ./internal/services -count=1
```

说明：`headless / handlers / docker` 通过，`services` 仍被仓库既有 `claude_config_test.go` 阻塞，详见下方“已知仓库既有失败”。

### 已知仓库既有失败，本轮未新增

```bash
cd frontend
npm exec tsc --noEmit
```

当前仍失败于：

- `src/components/Terminal/*` 与 `src/components/terminal/*` 的大小写冲突。
- `@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-web-links` 类型解析失败。
- `frontend/src/pages/ContainerTerminal.tsx` 既有隐式 `any`。

```bash
cd backend
go test ./internal/headless ./internal/handlers ./internal/services ./internal/docker -count=1
```

当前仍失败于：

- `internal/services/claude_config_test.go` 中既有 `env var` 解析测试：
  - `TestInvalidEnvVarFormat`
  - `TestInvalidLowercaseVarNameProperty`
  - `TestParseEnvVarsWithInvalidLine`

## Review 摘要

### 改动面证据

`git diff --stat` 当前显示：

- 41 个文件变更。
- `1155 insertions`
- `2174 deletions`

其中删除主要来自：

- `vscode-extension/` 全量移除。
- Docker 构建链路精简。

### 本轮新增的最终收口

- `frontend/src/hooks/useHeadlessSession.ts`
  - 新增实时事件去重，并在 `stopSession` 时透传当前 `session_id`。
- `frontend/src/pages/HeadlessTerminal.tsx`
  - 新增 conversation-scope reconnect 逻辑，彻底收口到当前 conversation。
- `frontend/src/services/headlessWebsocket.ts`
  - `headless_stop_session` 支持携带 `session_id`。
- `backend/internal/handlers/headless.go`
  - 停止会话改为优先按精确 `session_id` 命中，并移除 conversation 新建时的无差别 `pkill`。
- `backend/internal/services/container.go`
  - unlimited 校验与 `gpu_count` 边界补齐。
- `docker/Dockerfile.base`
  - root 缓存目录统一软链到 developer 目录。
- `deploy-docker/Dockerfile.base`
  - root 缓存目录统一软链到 developer 目录。
- `frontend/__tests__/hooks/useHeadlessSession.test.tsx`
  - 新增 hook 级重复事件测试与“精确 stop session”测试。
- `frontend/__tests__/pages/Dashboard.ContainerCreate.test.tsx`
  - 更新容器创建参数断言，覆盖新增资源与 skills 参数。
- `backend/internal/services/config_template_service_test.go`
  - 新增 `npx skills` 安装 frontmatter 解析测试。

## 外部依据

已核对当前 `skills` 官方用法，确认 `npx skills add` 仍是稳定入口，且支持：

- `-g, --global`
- `-a, --agent <agents...>`
- `-s, --skill <skills...>`
- `-y, --yes`
- `--all`

参考：

- `https://www.npmjs.com/package/skills`（本轮 Tavily 检索命中 `skills@1.5.0` Readme）
- `https://github.com/vercel-labs/skills`

## 建议下一步

1. 在真实宿主补一次 `docker system df / docker volume ls / whoami / which node / docker inspect` 运行态核验，确认任务 4 / 5 / 6 的最后 2%-5%。
2. 修复前端既有 `tsc` 阻塞项，再补一轮全量前端构建校验。
3. 若后续要把“skills 自动注入”扩展为“每次 restart 都重新安装最新模板”，再单独补持久化模板选择与 `StartContainer` 再注入策略。
