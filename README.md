# 吾水阁账号站

独立的中文账号中心，使用 React、Vite、TypeScript 和 Supabase，部署到 Cloudflare Workers 静态资源托管。提供邮箱注册与验证、登录、密码恢复、账号资料与头像设置、邮箱与密码修改、OAuth 授权及已授权应用管理。

首版不包含演示站、网关改造、社区、等级、会员、第三方登录或 Passkey。品牌背景见 [吾水阁账号体系](吾水阁账号体系.md)。

## 本地开发

需要 Node.js 22.12+ 与 pnpm 10。复制公开构建配置并填写独立的开发 Supabase 项目：

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_SITE_URL` 都会进入浏览器构建产物。不要填写 secret key 或 service-role key。缺少配置时页面会显示配置提示。

先按 [部署与 Supabase 配置](docs/deployment.md) 执行数据库迁移、设置邮件模板和回调地址；只启动前端不能完成真实认证。生产配置更改后需要重新构建部署。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 本地开发 |
| `pnpm check` | TypeScript 与 ESLint 检查 |
| `pnpm test` | 单元及组件测试 |
| `pnpm test:e2e` | Playwright 浏览器测试 |
| `pnpm test:db` | 隔离 PostgreSQL 迁移与权限断言（需 Python 3、Docker 和指定本地镜像） |
| `pnpm build` | 构建至 `dist/` |
| `pnpm preview` | 预览构建产物 |
| `pnpm deploy:check` | 构建并校验 Wrangler 发布配置 |
| `pnpm deploy` | 构建并发布 Cloudflare Worker |

首次运行浏览器测试需要 `pnpm exec playwright install chromium`。Linux 缺少系统库时由开发机管理员安装 Playwright 所需依赖。

## 页面与数据

| 路径 | 内容 |
| --- | --- |
| `/` | 根据会话转入登录或账号设置 |
| `/login`、`/register` | 邮箱登录、注册与重发确认邮件 |
| `/forgot-password` | 发送恢复邮件 |
| `/auth/callback` | 校验邮件 `token_hash`，移除地址栏凭据 |
| `/reset-password` | 仅验证过恢复邮件的会话可设置新密码 |
| `/account` | 昵称、头像、邮箱、密码与中心退出 |
| `/account/apps` | 查询、撤销已授权应用 |
| `/oauth/consent` | 展示并处理 Supabase OAuth 授权请求 |

Supabase Auth 是账号及展示资料的写入来源，数据库触发器把选定 metadata 字段同步至只读 `profiles`；头像保存在公开的 `avatars` bucket。业务角色、余额及各网站的会话仍属于业务站。

- [部署与 Supabase 配置](docs/deployment.md)：迁移、SMTP、邮件、Storage、OAuth Server、Cloudflare。
- [OIDC 接入约定](docs/oidc-integration.md)：PKCE、令牌校验、身份映射与独立会话。
- [验收清单](docs/verification.md)：自动化与真实项目检查，包含权限 SQL。

中心退出仅调用 `signOut({ scope: 'local' })`。中心退出和撤销授权都不会自动删除业务网站已建立的本地会话。
