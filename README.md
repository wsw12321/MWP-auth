# Water5 Auth 开发说明

建设一个独立的统一账号站，供现有 Codex Gateway 和未来开发的网站通过 OIDC 接入，实现单点登录（SSO）。示例域名为 `https://accounts.example.com`，开发时替换为实际域名。

## 网站需要做成什么样

- 使用统一品牌样式，适配桌面和手机。首版支持邮箱密码注册、邮箱验证、登录、退出、忘记密码和重设密码。
- 登录后进入账号设置页，可修改昵称、头像、邮箱和密码；邮箱修改走 Supabase 验证流程。
- 提供“已授权应用”页面，展示接入过的网站并允许撤销授权。
- 实现 `/oauth/consent` 授权页：接收 Supabase 的 `authorization_id`，检查登录状态，获取并展示应用名称和请求的资料范围，处理同意或拒绝，按 Supabase 返回的地址跳转。
- 从其他网站进入时，登录后继续原授权流程。账号中心会话仍有效时，访问另一个网站通常无需再次输入密码，但可能需要确认授权。
- 首版只接入自己维护的网站，手工登记应用；第三方登录、Passkey 和开放应用注册可后续扩展。

账号身份和基础资料存放在 Supabase。账号站不需要维护另一份本地用户数据库。各业务网站继续保存自己的用户 ID、角色、审批状态及业务数据；网关的用量、余额、订阅、账单、API Key 等仍留在原服务器。

## Supabase 如何配置

1. **创建项目**：建立专门用于统一身份的 Supabase 项目，开发和生产环境分开。认证用户由 Supabase Auth 管理，不自行建立密码表。
2. **启用邮箱认证**：开启 Email/Password 和邮箱验证，配置生产 SMTP、发件人及确认邮件、重设密码邮件模板。
3. **配置账号站地址**：在 Authentication 的 URL Configuration 中，将 Site URL 设为 `https://accounts.example.com`。Redirect URLs 按实际实现登记账号站的确认、恢复等跳转地址，例如 `/auth/callback`、`/reset-password` 的完整 URL；开发地址只加入开发环境。
4. **建立资料表**：创建 `profiles`，使用 `id`（UUID，主键并引用 `auth.users.id`）、`display_name`、`avatar_url` 等字段。通过注册触发器或服务端流程创建资料行。启用 RLS 并配置必要授权，只允许用户读取和修改自己的记录（`auth.uid() = id`），禁止修改他人资料。业务角色和余额不放入此表。
5. **启用身份提供服务**：在 Authentication → OAuth Server 中开启 OAuth Server，将 Authorization Path 设为 `/oauth/consent`，关闭动态客户端注册。配置 RS256 或 ES256 非对称 JWT 签名；OIDC ID Token 不能使用 HS256。账号站负责授权页面，Supabase 负责授权码和令牌签发。
6. **为每个网站登记应用**：在 OAuth Apps 中分别注册客户端。Go 网关等有后端的网站选择 Confidential，分别保存自己的 `client_id` 和 `client_secret`；纯前端应用使用 Public，不在浏览器存客户端密钥。精确登记各网站完整回调 URL，例如 `https://gateway.example.com/auth/oidc/callback`，不使用通配符。默认只申请 `openid email profile` 中需要的身份信息。
7. **管理配置与密钥**：账号站配置 Supabase 项目 URL 和 publishable key。secret/service_role key 仅用于必要的服务端管理操作，不进入前端、日志或 Git，也不分发给业务网站。OAuth scope 不会自动限制数据库访问，资料表仍需正确配置 RLS。

注意：账号站的 Auth Redirect URLs 与各应用的 OAuth Redirect URIs 是两套配置。前者用于确认邮箱、恢复密码等流程，后者用于各网站的 OIDC 登录回调。

## 各网站的接入约定

- 使用 OIDC 授权码流程和 PKCE，通过发现文档读取服务端配置；验证 state、nonce、ID Token 签名、issuer、有效期及本站 client_id 对应的 audience。
- 各站用 `(issuer, sub)` 映射自己的本地用户 ID，并建立独立会话；不共享跨站 Cookie，也不以邮箱作为永久关联键。
- 网关旧用户先验证旧账号，再绑定统一身份，保留原有用户 ID 和全部业务数据。新用户是否能使用某网站，由该站的邀请、审批和权限规则决定。
- 区分“退出本站”“退出账号中心”和“退出所有网站”。中心退出或撤销授权不会自动清除各站已建立的本地会话；全局封禁及全站退出需要额外的同步和会话撤销机制。

首期先用两个演示网站验证跨站登录、回调、授权和退出，再接入网关的旧账号绑定。Supabase OAuth Server 当前仍为 beta，上线前需验证这些流程。

参考：[OAuth Server 配置](https://supabase.com/docs/guides/auth/oauth-server/getting-started)、[用户资料管理](https://supabase.com/docs/guides/auth/managing-user-data)、[OAuth 令牌与权限](https://supabase.com/docs/guides/auth/oauth-server/token-security)。
