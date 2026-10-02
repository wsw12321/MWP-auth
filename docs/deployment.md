# 部署与 Supabase 配置

本仓库发布一个静态 SPA。Supabase 提供 Auth、OAuth Server、Postgres 和 Storage；浏览器只使用 publishable key，首版无需 service-role key。以下步骤需要项目拥有者在自己的 Supabase 与 Cloudflare 账号中完成，仓库不会自动创建远程项目或发送邮件。

## 1. 开发与生产隔离

创建两个独立的 Supabase 项目，分别配套开发和生产站点、SMTP 配置与 OAuth 客户端。开发时可使用托管的开发项目；本仓库不附带完整自托管 Supabase 配置。

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
VITE_SITE_URL=http://localhost:5173
```

复制 `.env.example` 为 `.env.local` 后填写开发配置。生产 `VITE_SITE_URL` 使用实际 HTTPS 账号站 origin，例如 `https://accounts.example.com`，不要附加业务路径或尾部斜杠。这三个变量属于 **Vite 构建时公开配置**，会进入 JS 产物；设置 Worker 运行时 secrets 不能替代重新构建。禁止把数据库密码、OAuth client secret、secret/service-role key 放入任何 `VITE_` 变量。

## 2. 数据库与头像

在开发项目的 SQL Editor，以项目管理员执行 [202610020001_accounts.sql](../supabase/migrations/202610020001_accounts.sql)。这是一次性迁移，首次验证通过后再对生产应用。已有 Supabase CLI 工作流也可以在关联正确项目后执行 `supabase db push`；先确认目标 project ref，不要把开发验证数据写入生产。

迁移创建：

- `public.profiles(id, display_name, avatar_url, updated_at)`，引用 `auth.users`，删除用户时级联删除资料。
- 注册和 Auth metadata 更新触发器，固定空 `search_path`、全限定表名，并撤销浏览器角色的函数执行权限。昵称使用 `display_name` → `name` → `full_name` 的首个非空字符串；头像使用 `avatar_url` → `picture`。只映射这些展示字段。
- `profiles` RLS：authenticated 用户仅能读取本人记录，匿名角色无表权限，不授予任何前端 INSERT/UPDATE/DELETE。资料写入只走 `auth.updateUser({ data })`，前端同时更新三个昵称字段或两个头像字段；恢复默认头像时两个字段都置为 `null`。这些 metadata 是用户可编辑的，不能用于权限判断。
- `avatars` 公开 bucket，仅接受不超过 **2 MiB（2,097,152 字节）** 的 JPEG、PNG、WebP。公开下载无需登录；不要上传私密内容。浏览器预检之外，Storage 的大小/MIME 限制负责服务端校验；此限制不是图片转码或恶意文件扫描服务。
- Storage 写入、替换、删除限定到 `<auth.uid()>/<随机文件名>.<扩展名>` 且 JWT 顶层没有 `client_id` 的会话。不能用 OAuth 客户端 access token 修改账号头像。限制性策略防止其他宽泛的 permissive policy 绕过该 bucket 的写入约束。

触发器不吞掉异常：如果资料长度、URL、类型或同步写入失败，整次 Auth metadata 事务失败，页面不得显示保存成功。昵称最多 64 字符；头像 URL 最多 2048 字符且必须为 HTTP(S)。迁移会回填已有用户，既有资料违反这些约束时迁移会失败并回滚；先在开发副本中检查清理，而不是移除约束。

替换头像使用新随机文件名，避免缓存展示旧图；先上传成功，再更新 metadata，最后删除旧对象。恢复默认头像先清空 metadata，再删除旧对象。Storage 与 Auth 不共享事务，删除失败可能留下未引用文件；不要因此谎报已删除，也不要撤销已成功的新资料。删除账号不会自动删除 Storage 实体，后续需要管理员用 Storage API 清理遗留头像，不能只删 `storage.objects` 行。

已有项目还需要检查 `pg_policies`：本迁移不删除其他业务 bucket 的策略。头像公开下载与元数据列表访问是不同权限，不要为方便上传开放全 bucket 的匿名 INSERT/UPDATE/DELETE。

## 3. 邮箱认证、SMTP 与两步邮箱修改

在 Supabase Dashboard → Authentication 中开启 Email/Password、Confirm email，配置密码策略及生产 SMTP；保持未使用的 Anonymous sign-ins 和其他登录方式关闭。启用 **Secure email change**，保留新、旧邮箱都需确认的默认安全流程。启用 Secure password change 时，本页面支持 Supabase 要求的重新验证及邮件验证码；将 Reauthentication 模板也设为中文。SMTP 使用生产可投递域名、正确的 SPF/DKIM/DMARC；关闭邮件服务商会改写链接的点击追踪，并验证投递、垃圾箱和速率限制。

在 Authentication → URL Configuration 配置：

| 设置 | 开发示例 | 生产示例 |
| --- | --- | --- |
| Site URL | `http://localhost:5173` | `https://accounts.example.com` |
| Redirect URL | `http://localhost:5173/auth/callback**` | `https://accounts.example.com/auth/callback**` |

本页面的 `emailRedirectTo` / `redirectTo` 是 `/auth/callback?next=...` 完整 URL，Supabase allowlist 必须允许该查询参数。上表使用固定可信 origin 与 callback 路径后缀匹配；不要登记任意域名或整个生产域的宽泛通配符。若项目提供精确查询匹配规则，可缩小范围，但要实测编码过的 OAuth 续接参数。开发地址只加入开发项目。

在 Authentication → Email Templates 中按下表粘贴完整 HTML，并设置中文主题：

| 后台模板 | 本地文件 | 建议主题 |
| --- | --- | --- |
| Confirm signup | [confirm-signup.html](../supabase/templates/confirm-signup.html) | 验证邮箱，开启吾水阁账号 |
| Reset password | [reset-password.html](../supabase/templates/reset-password.html) | 重设吾水阁账号密码 |
| Change email address | [change-email.html](../supabase/templates/change-email.html) | 确认修改吾水阁账号邮箱 |
| Reauthentication | [reauthentication.html](../supabase/templates/reauthentication.html) | 吾水阁账号安全验证码 |

三个链接模板固定指向 `{{ .SiteURL }}/auth/callback`，使用 `{{ .TokenHash }}` 和类型 `signup`、`recovery`、`email_change`；把 `{{ .RedirectTo | urlquery }}` 放在 `redirect_to` 参数。页面只从同源 `/auth/callback` 的 `redirect_to` 中取允许的 `next`，不会直接把它作为跳转目的地。不携带或不合法的续接地址回到账户默认页。这样即使换浏览器打开，也能直接通过 `verifyOtp` 获得服务端确认结果，不依赖发起浏览器的 PKCE verifier。

注册邮件可在注册页重发，恢复邮件可在忘记密码页重发。邮箱变更需要登录账号设置重发。首次确认新或旧邮箱可能返回成功但不带 user/session；这代表仍待另一邮箱确认，不代表登录成功、链接无效或改邮已完成。完成双确认后再刷新服务端用户信息。不要关闭 Secure email change 来绕过这个状态。

仅恢复邮件 `verifyOtp` 成功且获得会话后才允许重设密码，恢复状态绑定用户与 session；普通登录不能制造恢复权限。回调完成后移除 token_hash，避免其留在当前地址栏。无效、过期或已消费链接提供相应重发入口；不同浏览器重复点击同一链接仍会受到 Supabase 单次 token 约束。不要在分析脚本、错误上报或接入层日志中采集回调 URL 中的凭据；本版未引入外部分析脚本。

本版只配置上述模板；Magic link 登录、管理员邀请和第三方登录不是已交付流程。实际邮件链接必须使用这里的模板，默认 `ConfirmationURL` 模板不属于当前 token_hash 回调协议。

官方依据：[邮件模板变量](https://supabase.com/docs/guides/auth/auth-email-templates)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[密码认证](https://supabase.com/docs/guides/auth/passwords)。

## 4. Supabase OAuth Server

在 Authentication → OAuth Server 开启 OAuth Server，Authorization Path 设为 `/oauth/consent`。Supabase 会把它与 Authentication 的 Site URL 拼成账号站授权页，并附加 `authorization_id`。关闭动态客户端注册，首版仅由管理员手工登记自有应用。

在 JWT Signing Keys 设置 **RS256 或 ES256 非对称签名**，按 Supabase 的启用/轮换流程将该 key 设为当前签名密钥。OIDC `openid` 流程生成 ID Token 要求非对称算法；HS256 不满足此要求。检查实际 discovery 中的 issuer、JWKS URI 和算法，不能仅以后台“已添加密钥”代替真实令牌验证。

手工登记 OAuth 应用：有后端的网站使用 confidential 客户端，client secret 只保存在该站服务端；纯前端应用使用 public 客户端，不分配浏览器秘密。精确登记该业务站的 OAuth callback，例如 `https://gateway.example.com/auth/oidc/callback`。开发、生产使用不同客户端，禁止通配回调。

**两类回调不能混用：** Auth Redirect URLs 是账号站的邮件验证跳转；OAuth 客户端 Redirect URIs 是业务站交换授权码的回调。`/oauth/consent` 是授权交互页面，既不是邮件回调，也不是业务站接收授权码的地址。

授权页用官方 SDK `getAuthorizationDetails` 展示客户端和范围；已有授权的返回可能直接包含 `redirect_url`。同意与拒绝分别用 `approveAuthorization`、`denyAuthorization`，只使用 Supabase 返回的跳转地址。应用管理页用 `listGrants`、`revokeGrant`；撤销不应被表述为删除所有业务站会话。

官方依据：[OAuth Server 配置](https://supabase.com/docs/guides/auth/oauth-server/getting-started)、[OAuth token 与 RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)。Supabase OAuth Server 仍应按官方当前发布阶段评估，上线前完成 [真实验收](verification.md)，不能以 mock 测试代替。

## 5. Cloudflare Workers 静态部署

仓库 `wrangler.jsonc` 发布 `dist/`，`assets.not_found_handling` 使用 `single-page-application`，保证 `/auth/callback`、`/oauth/consent` 等路由直接打开与刷新都返回 SPA。`public/_headers` 随构建复制到 `dist/_headers`，为静态响应设置 CSP、Referrer-Policy、禁止嵌入及其他安全响应头。若未来添加 Worker 脚本处理请求，须核实脚本响应同样携带所需头部。

1. 安装锁定依赖：`pnpm install --frozen-lockfile`。
2. 在构建环境设置三个生产 `VITE_` 变量；预览分支只使用开发项目。
3. 执行 `pnpm check`、`pnpm test`、`pnpm test:e2e`。
4. 执行 `pnpm deploy:check`，查看 Wrangler dry run 结果及 `dist/`。dry run 只校验构建/发布配置，不会验证 Supabase、DNS、SMTP 或真实授权。
5. 用自己的 Cloudflare 账号执行 `pnpm exec wrangler login`，确认 `wrangler.jsonc` 的 Worker name 与目标账号，再执行 `pnpm deploy`。CI 可使用有目标 Worker 发布权限的 Cloudflare API token，存入 CI secrets。
6. 在 Cloudflare 为该 Worker 绑定正式域名，重新检查 `VITE_SITE_URL`、Supabase Site URL、Auth Redirect URLs 三者一致。
7. 在实际 HTTPS 域名检查深层链接状态码、响应头、真实邮件、移动端和 OAuth 全流程。CSP 若使用自定义 Supabase 域名，需要同步收窄/调整允许的连接域，不要直接改为无限制脚本策略。

官方依据：[Workers SPA 回退](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)、[静态资源响应头](https://developers.cloudflare.com/workers/static-assets/headers/)。
