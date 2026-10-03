# 验收与验证边界

本地单元/浏览器测试使用受控的 Supabase 响应验证界面与状态机。数据库策略、SMTP、OAuth Server、跨浏览器真实 token 及线上 Cloudflare 响应必须在真实项目实测。以下分别记录已执行检查和待验收步骤；配置成功不代表完整认证流程已经验收。

## 同源 API 代理发布前检查（2026-10-03）

针对大陆浏览器可打开账号页但无法直连 Supabase 的问题，生产前端默认通过 `/supabase/*` 请求当前新加坡项目。真实项目 URL 保留，用于固定 Worker 上游、兼容原会话键和已有头像；不迁移用户或数据库。

| 检查 | 结果与边界 |
| --- | --- |
| TypeScript、ESLint、生产构建和 Wrangler dry run | 全部通过。Worker 入口、ASSETS 绑定、代理路径优先级和固定上游配置均进入发布产物。 |
| Vitest | 12 个文件、139 项通过；包含 40 项代理测试，以及真实 SDK 恢复原会话/PKCE、同源刷新、旧头像显示和清理的兼容测试。 |
| Playwright | 桌面/手机 66 项通过。强制同源 API 并阻断原 Supabase 域名，覆盖登录注册、确认邮件、续期、资料、头像和授权界面。均使用模拟账号/接口。 |
| 实际本地 Workers 运行时 | 11 项只读探测通过：页面 200、未知 API JSON 404、带公开 key 的认证健康/配置 200、无用户 JWT 的 user/profiles 401、discovery 200 且 issuer 不变、登录 OPTIONS 200。另确认空登录 POST 返回参数错误 400，OAuth authorize 返回 302 到 `/oauth/consent`，未由 Worker 跟随跳转。API 响应包含 no-store。 |
| 代码独立审查 | 未发现确定的发布阻断项；审查覆盖代理范围、请求头、重定向、缓存、会话及头像兼容。 |
| 发布流程 | 使用现有 Git 集成，提交并推送 `wsw12321/MWP-auth` 的 `main` 后由 Cloudflare 自动发布。本轮不使用本机 Wrangler 发布命令。 |

以上联网探测来自当前开发环境的海外出口，不代表大陆线路实测。没有创建真实账号、发送邮件、上传文件或启用网关 OIDC；完整大陆登录注册、邮件投递及业务站首次授权跳转仍需实际验收。代理覆盖账号站 API，业务站首次 OAuth authorize 跳转须按 [OIDC 接入约定](oidc-integration.md#客户端与发现文档) 另行适配。

## 新加坡项目重建与检查（2026-10-03）

当前项目为 `uuwucstroazapvrmnprx`（`water5-auth`），地区为新加坡 `ap-southeast-1`。账号站保持 `https://auth.water555.com`，发件人保持 `吾水阁账号中心 <no-reply@mwp-mail.water555.com>`。原用户、资料、授权记录和头像文件未迁移。

| 项目 | 本次结果 |
| --- | --- |
| 数据库初始化 | 已重放 accounts 迁移并将历史版本对齐仓库的 `202610020001`；profiles、同步函数、两个 Auth 触发器、8 条 RLS 策略及 avatars bucket 已恢复。 |
| 数据库权限 | 现有 `permissions.sql` 在事务中执行通过；仅事务内启用 Storage SQL 删除测试，执行后回滚，确认用户、资料和对象记录均为 0。匿名 HTTP 读取 profiles 返回 401。 |
| Auth 和邮件 | Site URL、回调、邮箱确认、双邮箱修改确认、密码最少 10 位、30 封/小时、SMTP 及四份中文模板已恢复。除不可回读的密码和平台派生字段外，Auth 全量配置与旧快照一致。没有发送测试邮件，实际邮件投递待验收。 |
| JWT 与 OAuth | 当前签名键为 ES256，discovery issuer 与新项目一致。Codex Gateway 新 Client ID 为 `b883cebe-d570-4e7b-96dc-0423b15f9a89`，网站/回调/类型/认证方式均回读一致；正常回调返回 302，未登记回调返回 400。 |
| Storage、Data API、Realtime | 用户可配置参数与旧快照一致，无额外变更。 |
| 生产网关 | 已更新配置文件中的 issuer、host、Client ID 和 secret，并验证权限与凭据一致。按用户要求保持线上 OIDC 关闭；6 个容器 ID 和 Gateway 启动时间不变，无数据库操作。 |
| 本地校验 | TypeScript、ESLint、80 项单元测试及桌面/移动端 4 项网站目录和应用入口浏览器测试通过；构建与 Wrangler dry run 通过，产物含新项目地址和 Client ID，不含旧项目地址或私密凭据。浏览器依赖仅解包到临时目录。 |
| 线上发布 | 已发布到原 `water5-auth` Worker 和 `auth.water555.com`，版本 `c11e0c51-2a6e-4797-b84f-6e4f37dd17cb`。9 条页面路由均返回 200，安全响应头生效；线上 8 个 JS/CSS 资源逐字节匹配本地构建，确认新项目与 Client ID 已上线。 |

重建快照与敏感操作记录存放在本地 `.supabase-rebuild/`，已排除 Git；不能提交或公开上传其中的凭据文件。

## 旧项目远程配置与检查（2026-10-03，重建前记录）

目标项目为 `hqsbxndtzyspkvoaxvid`（`water5-auth`），账号站为 `https://auth.water555.com`。

| 项目 | 已确认结果 |
| --- | --- |
| 数据库迁移 | 已执行 `202610020001_accounts.sql`，远程迁移历史版本与仓库一致；创建 profiles、同步触发器、avatars bucket 和访问策略。 |
| 认证设置 | Site URL 为 `https://auth.water555.com`；Redirect URLs 为 `https://auth.water555.com/auth/callback**`；开启邮箱注册、邮箱确认和双邮箱确认修改；密码最少 10 位，匿名登录关闭。 |
| OAuth Server | 已启用；Authorization Path 为 `/oauth/consent`；动态客户端注册关闭。OIDC discovery 可读取，公开 JWKS 包含 ES256 密钥。完整用户授权与换码流程仍待联调。 |
| 授权网站 | 已确认 `Codex Gateway` 为手工登记的 confidential 客户端，网站地址已补全为 `https://codex.water555.com`，精确回调为 `https://codex.water555.com/auth/oidc/callback`，认证方式为 `client_secret_basic`。`openid email` + S256 PKCE 请求成功跳转至账号站授权页，未登记回调路径返回 HTTP 400。公开接入参数见 [已登记授权网站](oidc-integration.md#已登记授权网站)。 |
| 数据库权限 | RLS、表授权、触发器函数权限和头像 bucket 限制均已检查。空项目中完整执行 `permissions.sql` 并回滚，通过资料同步、匿名/跨用户隔离、禁止直接修改资料、头像本人操作与 OAuth 写入限制断言；确认无残留用户、资料或文件记录。 |
| 线上前端 | `/login`、`/auth/callback`、`/oauth/consent` 均返回 200；部署产物包含正确的 Supabase 项目地址和正式 Site URL。 |
| 邮件与 SMTP | 已接入 Resend：`smtp.resend.com:465`，当前发件人为 `吾水阁账号中心 <no-reply@mwp-mail.water555.com>`；四份中文模板及主题已上传并全文回读核对。按用户明确授权，Supabase 发信限额已调整为每小时 30 封并回读确认。 |
| 发信域名变更 | 已切换到 `mwp-mail.water555.com`。公共 DNS 已解析出新 DKIM TXT，以及 `send.mwp-mail` CNAME 对应的 SPF 与退信 MX；用户确认 Resend 状态为 Verified。新域名实际发信请求已受理，Supabase 发件地址、当前 SMTP 密钥及本地配置已同步。旧域名与 DNS 尚未删除，由用户在确认收信后清理。账号站仍为 `https://auth.water555.com`。 |
| 测试邮件 | 旧域名普通测试邮件和新域名“吾水阁新发信域名验证”邮件均已向用户指定地址提交，Resend HTTPS API 已受理；当前密钥无法查询投递状态，是否到达收件箱仍待收件人确认。本机直连 SMTP 的 TLS 握手失败，这些测试未经过 Supabase Auth，不能替代真实认证邮件验收。 |

远程权限测试只写入事务内 fixture 元数据，未上传文件字节或触发认证邮件。为适配托管 Storage 的 SQL 删除保护，本次在传输的测试 SQL 的 `BEGIN` 后加入 `SET LOCAL storage.allow_delete_query = 'true'`，其作用随事务回滚结束；未永久修改 Storage 配置。真实 Storage HTTP 上传、注册验证、密码恢复、双邮箱确认修改和完整 OIDC 流程仍待后续验收。

## 网站目录与应用入口检查（2026-10-03）

| 检查 | 结果与边界 |
| --- | --- |
| TypeScript、ESLint 与生产构建 | 通过，构建包含公开 `/sites` 页面及已授权应用入口。 |
| Vitest 单元与组件回归 | 9 个测试文件、80 项通过；包含可信客户端登录入口和不安全网站 URI 拦截。 |
| Playwright 桌面与手机浏览器 | 62 项通过；验证公开网站目录、刷新、点击跳转、授权撤销与目录独立，以及 320 像素窄屏无水平溢出。页面截图已检查。 |
| 网关跨站浏览器回归 | 在网关仓库使用真实 Chromium 和本地 HTTPS 模拟服务通过；验证自动站内 POST 登录、已有会话直接进入、Strict Cookie 恢复、OIDC 关闭或会话服务失败时保留本地登录、重复提示不发起登录、等待配置期间本地登录取消自动跳转。 |

账号站与网关源码需分别部署；网关仍须启用 OIDC，且用户已完成账号绑定。以上回归使用受控响应及模拟身份，真实用户授权、换码和线上登录联调仍待执行。

## 本轮已执行的检查（2026-10-02）

| 检查 | 结果与边界 |
| --- | --- |
| TypeScript、ESLint、生产构建及 Wrangler dry run | 通过。仅校验构建/发布配置，没有发布远程 Worker。 |
| Vitest 单元与组件回归 | 8 个测试文件、69 项全部通过，包含恢复会话、授权异步响应、头像失败补偿与安全路径。 |
| Playwright 桌面与手机浏览器 | 58 项全部通过，使用真实 SDK 与受控 Supabase 响应；中文截图已检查。 |
| 本地 Workers 深层路由与响应头 | 8 条路由均返回 200 与 SPA HTML；CSP、Referrer-Policy、X-Frame-Options 生效。未配置环境的生产构建可显示配置提示，无浏览器运行错误。 |
| PostgreSQL 17 隔离执行迁移及 `permissions.sql` | 通过。auth/storage 使用最小模拟 schema；容器已清理。 |
| 在额外宽泛 Storage permissive policy 下重跑权限断言 | 通过。头像 restrictive guard 仍拒绝匿名、他人和 OAuth 写入/删除。 |
| 4 份邮件模板使用 Go `html/template` 编译、渲染 | 通过。3 种回调类型、token_hash、嵌套编码的 OAuth next 均完整往返，验证码模板正常渲染。 |
| 真实 Supabase Auth/Storage/SMTP/OIDC 联调 | 尚未执行，需要开发项目参数、邮箱与临时 OAuth 客户端。 |
| 生产 Cloudflare 域名发布及真实响应 | 尚未执行，需要目标 Cloudflare 账号与域名配置。 |

自动化结果仅适用于本地构建、受控响应与隔离数据库；不能替代下方真实服务验收。浏览器依赖和中文字体按开发机环境安装，不属于生产前端依赖。

## 自动化

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm deploy:check
```

单元/组件测试应覆盖站内续接与恶意跳转拦截、重复邮件验证去重、恢复状态和过期会话、邮箱双确认中间状态、授权同意/拒绝/已有授权、撤销失败和资料同步失败。浏览器测试应覆盖手机与桌面、可用的键盘焦点与表单标签、深层路由刷新及会话恢复。请以实际测试报告为准；mock 成功不能证明远程服务配置正确。

## 数据库权限与同步

可先用 Docker 中的 PostgreSQL 17 执行隔离的 SQL/RLS 校验（需要 Python 3 和本地 Docker 权限）：

```sh
docker pull postgres:17.6-alpine3.22
pnpm test:db
```

脚本只使用指定本地镜像，运行一个无网络、无主机端口和临时存储的容器，结束后删除。它模拟迁移所需的 auth/storage 表和函数，并额外验证宽泛的既有 Storage permissive policy 无法绕过头像写限制；这能验证 SQL 与 RLS 逻辑，但不是完整 Supabase 集成测试。

再对一次性开发数据库应用迁移，然后用项目数据库连接在受控终端执行：

```sh
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/permissions.sql
```

`DEV_DATABASE_URL` 是数据库管理连接，只用于人工验收，不是前端环境变量，不提交到 Git。脚本在事务中创建两名固定测试用户并全部回滚；须使用无同名 fixture 的一次性开发数据库。它断言注册/metadata 同步、失败时 Auth 更新回滚、匿名和跨用户资料隔离、拒绝前端直接写资料、拒绝跨用户头像写入/移动/删除、拒绝 OAuth token 写删头像，以及本人可写删头像。SQL 通过角色和 JWT claims 模拟 RLS，不会上传真实文件字节，不能替代 Storage HTTP 验收。

另外通过浏览器/Storage API 检查：

- JPEG、PNG、WebP 在 2 MiB 以内可上传；超限或其他 MIME 在前端和服务端拒绝。直接绕过前端调用 Storage API 再测一次服务端限制。
- 用用户甲 session 向用户乙目录上传、替换与删除应失败；用 OAuth access token 写自己目录也应失败。
- 匿名无法读取私有 `profiles`；用户甲读取用户乙 profile 得到空结果/拒绝，不能泄漏昵称资料行。
- 公开头像 URL 在未登录浏览器可读取；随机名替换、默认头像恢复及旧对象删除结果与页面提示一致。
- 人工让 metadata 违反迁移约束，确认 Auth update 报错、旧资料仍在、页面不显示保存成功。恢复正常约束后重试，不要保留验收故障。

迁移使用 SECURITY DEFINER 触发器，检查函数 owner 仍为管理员、`search_path` 固定，anon/authenticated 没有 EXECUTE 和 profiles 写权限。确认未来迁移没有引入宽泛 Storage 写策略、profile 写策略或信任 user_metadata 的业务授权。

## 真实账号与邮件

使用开发 SMTP、两枚真实可收信的测试邮箱，以及两个独立浏览器（或隔离 profile）。

1. 注册邮箱、密码、昵称；未确认前不能登录；检查中文邮件主题和链接。注册失败/邮件速率限制应显示可操作错误，重发确认邮件后可验证。
2. 在另一个浏览器打开注册邮件，通过 `token_hash` 确认并获取会话；地址栏移除凭据。刷新、后退、重复点同一链接不触发重复消费造成假成功；过期链接有重发入口。
3. 从 `/oauth/consent?authorization_id=有效请求` 开始注册、登录或恢复，回调后续接原授权页。外部 URL、双斜杠、编码后的恶意路径不能作为账号流程的续接目标。
4. 恢复邮件在另一浏览器打开后进入重设密码，普通登录或手写 `/reset-password` 不足以获得恢复权限。恢复过程中 Auth 事件不能提前跳回账号页；刷新后状态按当前实现与绑定会话一致，退出/换账号/失效后不再可用。成功修改后新密码可登录、旧密码不能登录。
5. 修改邮箱：先点旧邮箱再点新邮箱，反过来再做一遍。第一次提示仍待另一邮箱确认；两次完成后刷新用户信息并以新邮箱登录。无效、已消费或过期链接可回到对应重发流程。
6. 在 Secure password change 开启的项目中，使用超过重新验证窗口的会话改密码，确认能请求并提交 Reauthentication 邮件验证码；错误、过期 nonce 均不会显示修改成功。
7. 改昵称后 Auth metadata 三字段、profiles 与 UI 一致；上传、替换、恢复头像后双字段与 OIDC 展示资料一致。网络失败、profile trigger 失败与对象删除失败分别检查反馈。
8. 新开标签/刷新恢复会话，等待自动续期；模拟 session 失效或服务端撤销，账号设置与授权页应回到可重新登录状态。退出当前账号中心后，页面不再展示原账号私有数据。

## 授权与临时客户端

在开发项目临时登记一个自有测试客户端，使用成熟 OIDC 测试工具或既有业务站的测试环境，不新增演示站代码。只登记确切测试回调 URL，测试后删除客户端及测试授权。

- 通过 discovery + 授权码 + S256 PKCE 发起 `openid email profile` 请求。未登录跳登录并保留 authorization_id；已有中心会话直接展示授权。
- 校验应用名称、当前邮箱和 scope 展示。同意、拒绝、已有授权自动返回都只使用 Supabase 响应的 redirect_url；参数缺失、过期及请求失败有明确状态。
- 回到客户端校验 state、nonce、签名、issuer、audience 和有效期；使用 `(issuer, sub)` 映射测试账号。核实 ID Token/UserInfo 的昵称、头像以及 `sub` 一致。
- 在已授权应用页看到该 grant，取消撤销对话框不调用服务，确认后撤销成功；模拟失败后项目仍保留且错误可见。
- 撤销后验证重新授权、refresh token 与尚未过期 access token 的真实行为；验证业务站既有本地会话不会凭空清除，并按其会话策略处理。
- 切换账号、授权过程中 session 失效、客户端回调报错都不会复用前一个用户的授权信息。

## 布局与线上资源

在桌面和窄屏手机测试全部表单、长邮箱/应用名、空应用列表、错误/成功反馈和加载态。只用键盘完成登录、账号菜单、上传按钮、授权和撤销确认，检查标签、焦点可见性及屏幕阅读器提示；检查 200% 缩放无关键内容截断。

Cloudflare 部署后直接打开并刷新 `/login`、`/register`、`/forgot-password`、`/auth/callback`、`/reset-password`、`/account`、`/account/apps` 和 `/oauth/consent`。检查 SPA 回退、静态资源 MIME、CSP/Referrer-Policy 等实际响应头与 HTTPS 域名。无配置构建应显示配置提示；生产构建检查不含服务端密钥。保存测试环境、构建版本、测试日期和实际结果，再决定生产发布。
