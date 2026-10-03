# 业务站 OIDC 接入约定

账号站完成身份验证与用户授权，Supabase OAuth Server 负责授权码、令牌和 UserInfo。业务站继续拥有自己的用户主键、权限、审批、账单及会话。生产业务站的登记信息见下表；联调使用独立的测试客户端，验收后删除测试客户端即可。

## 已登记授权网站

| 配置 | Codex 网关（生产） |
| --- | --- |
| 网站地址 | `https://codex.water555.com` |
| 客户端名称 | `Codex Gateway` |
| Client ID | `3e9c79d8-3c51-4fee-a986-7a2d5fed62dc` |
| 客户端类型 | `confidential`，手工登记 |
| Token endpoint 认证方式 | `client_secret_basic` |
| 精确 Redirect URI | `https://codex.water555.com/auth/oidc/callback` |
| Issuer | `https://hqsbxndtzyspkvoaxvid.supabase.co/auth/v1` |
| 登录申请范围 | `openid email`，使用 S256 PKCE |

2026-10-03 已回读确认现有客户端及精确回调地址，并补全客户端网站地址。授权请求可跳转到账号站 `/oauth/consent`；未登记的回调路径被拒绝。完整的用户授权、换码及网关登录仍待联调。

Client ID 是公开接入参数；client secret 仅由网关服务端保管，不写入本仓库或前端构建配置。登记网站后，用户完成同意授权才会在 `/account/apps` 的“已授权应用”中看到该应用。

## 网站目录与应用入口

`/sites` 是公开的网站目录，目前展示 Codex 网关；点击网站进入其首页。目录由 `src/lib/sites.ts` 中的公开接入信息维护，新增网站时同步登记 OAuth 客户端并更新该目录。

`/account/apps` 仍只展示当前用户实际授予的应用。点击 Codex 应用名称或“进入应用”访问 `https://codex.water555.com/?login=water5`；网关检查已有会话，未登录时自动通过站内 POST 发起 OAuth 登录。账号中心已有会话及授权时可继续完成统一登录；首次绑定、账号失效或授权范围变化时按相应页面完成确认。账号中心不在跳转链接中携带用户令牌，也不直接构造业务站回调。

此入口需要网关部署支持 `login=water5` 的版本并启用 OIDC；未绑定网关账号须先在网关“账号安全”完成绑定。其他应用有合法 HTTPS 网站 URI 时提供网站入口；需要自动登录的新应用应在目录中配置其自己的登录入口。

## 客户端与发现文档

每个业务站、每个环境分别手工登记客户端，精确配置回调 URI。后端应用使用 confidential 客户端，secret 只留在其后端；纯前端使用 public 客户端并使用 PKCE。不要把账号站 publishable key 当成 OAuth client secret。

发行者预期为 `https://PROJECT_REF.supabase.co/auth/v1`，从 `https://PROJECT_REF.supabase.co/auth/v1/.well-known/openid-configuration` 获取 discovery。若项目使用自定义 Auth 域名，依据实际 discovery 确认并固定 issuer，不根据未验证的用户输入选择发行者。通过 discovery 读取 authorization endpoint、token endpoint、userinfo endpoint 和 JWKS URI，不在业务代码猜测接口。

## 授权码与 PKCE

1. 业务站为本次登录生成不可预测的 `state`、`nonce` 与 PKCE `code_verifier`，保存到短期、一次性登录事务。使用 S256 计算 `code_challenge`。后端会话 Cookie 使用 Secure、HttpOnly 和合适的 SameSite。
2. 重定向到 discovery 提供的授权端点，传入 `response_type=code`、本站 `client_id`、精确 `redirect_uri`、最少必需的 `scope`（通常 `openid email profile`）、`state`、`nonce`、`code_challenge`、`code_challenge_method=S256`。
3. Supabase 跳转账号站 `/oauth/consent?authorization_id=...`。账号站恢复中心会话；必要时登录后续接该授权请求，展示应用、当前账号与范围。
4. 业务站回调先处理用户拒绝等 OAuth error，校验 `state` 与原事务绑定，然后以授权码和原 `code_verifier` 请求 token endpoint。`redirect_uri` 必须与发起时完全相同，code/事务只消费一次。confidential 客户端使用其配置的 token endpoint authentication method，不把 client secret 放在 URL。
5. 校验 ID Token 后，以 `(issuer, sub)` 查找或建立业务站身份映射，再创建本站独立会话。成功或失败都清除临时登录事务；不要直接把任意 `return_to` 当成登录后地址，业务站也需要自己的站内 allowlist。

## 令牌校验

优先使用成熟 OIDC 库和 discovery/JWKS。至少验证：签名与明确允许的非对称算法、精确 `iss`、包含本站 `client_id` 的 `aud`、需要时的 `azp`、`exp`、合理的 `iat`/时钟偏差、登录事务 `nonce`。按库和所采用流程处理相关 hash claims。拒绝 `alg=none` 或算法混淆，不以仅 Base64 解码的 JWT 声明建立登录。

JWKS 缓存需要支持密钥轮换：遇到未知 `kid` 时有限度刷新，同时保留请求超时和重试限制。不要把一个 OAuth 客户端的 ID Token 接受为另一个客户端的登录凭证，也不要把 ID Token 当成任意业务 API 的 access token。

申请 `profile` 后，在真实测试客户端校验 ID Token / UserInfo 中的昵称和头像字段。本账号站更新 Auth metadata 的 `display_name/name/full_name` 以及 `avatar_url/picture`；这些字段都只是展示，不能授予管理员身份、会员、额度或审批权限。UserInfo 返回的 `sub` 必须与已验证 ID Token 一致。邮箱会变化，`email_verified` 也不能替代身份主键。

OAuth scope 控制 OIDC 中的信息范围，**不会自动限制 Supabase 数据库或 Storage 的访问**。数据库继续依赖 RLS；本仓库仅允许读取自己的 `profiles`，头像写操作另要求 JWT 不含 `client_id`。业务站不应持有 Supabase service-role key 来绕过这些规则。

## 身份绑定与退出

持久映射使用 `(issuer, sub)` 联合唯一键关联本站现有用户 ID。不同项目的 issuer 不同，即使邮箱相同也不能自动认为是同一个人。旧网关账号绑定前先验证旧账号所有权，再绑定统一身份；保留原用户 ID 与全部业务数据，不按邮箱静默合并。

各站自行建立并管理会话，不共享跨站 Cookie。账号中心会话存在时，后续授权通常无需重新输入密码；仍可能需要对新应用或新增 scope 明确授权。

| 操作 | 实际影响 |
| --- | --- |
| 退出业务站 | 清除该站本地会话，由该站实现 |
| 退出账号中心 | `signOut({ scope: 'local' })` 清除当前中心会话 |
| 撤销已授权应用 | 调用 Supabase `revokeGrant`，撤销该授权，后续续期/授权行为由 Supabase 决定 |
| 所有网站立即退出或统一封禁 | 本版未实现，需另建跨站会话撤销与权限同步机制 |

中心退出或撤销授权不会自动删除业务站已经建立的本地 Cookie/会话，也不要假设已签发 access token 会立刻失效。业务站需要根据自身风险设定会话有效期、刷新和服务端撤销策略。撤销后再次登录可能需要重新授权，应在真实客户端验证。

参考：[OAuth Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started)、[OAuth 流程](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)、[令牌与 RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)。
