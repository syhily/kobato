# Kobato Headless API — 接入指南

公开前端(官方或第三方)通过 Content API 消费站点内容与交互。本指南覆盖:拓扑、鉴权、代理写契约、错误/分页/日期约定。

## 拓扑

```
访客浏览器 ──→ 你的前端(SSR 服务)
              ├─ 读:匿名浏览器直连 core /api/content/v1(或 SSR 服务端经 SDK 调 /rpc)
              ├─ 写:经你的服务端代理 + JWT 调 core /api/content/v1
              └─ 图片/feed/sitemap/webmention:代理或直连 core
core(SEA ①)= /rpc(oRPC)+ /api(REST)+ admin + DB
```

- **读**:匿名,浏览器直连 `GET /api/content/v1/*`,响应带 `Access-Control-Allow-Origin: *`。
- **写**:必须经你的服务端代理,浏览器直连写一律 403/指引。代理附加头族(见下)。
- 官方前端走 `/rpc`(typed client);第三方经 `/api`(REST + OpenAPI spec,见 `/api/content/v1/openapi.json`)。

## 鉴权(前端凭证)

1. admin 在 `/admin/security/keys` 注册**命名 Ed25519 公钥**(页面可生成密钥对并下载私钥)。
2. 你的前端持有私钥,签发短期 JWT(EdDSA):

```
header  = { "alg": "EdDSA", "typ": "JWT" }
payload = { "iss": "<key-id>", "scope": ["content:write"], "exp": <now+300> }
```

3. 写请求带 `Authorization: Bearer <jwt>`。core 规则:`exp ≤ 5min`、±60s 时钟容忍、scope 须含 `content:write`、吊销即拒。私钥泄漏处理:注册新钥 → 前端切换 → 吊销旧钥。

## 代理写契约(头族)

写交互(评论提交/编辑、点赞、订阅、友链申请)与需身份读(我的评论等 authed procedures)
必须经前端服务端代理。core 的 enforcement 模型:JWT 为**可选增强**(前端未配置私钥时
匿名转发仍可提交公开写操作),但转发头(`X-Forwarded-*`、`X-Kobato-Comment-Token`、
`X-Kobato-Session-Token`)**仅在有效 key 时被采信**——匿名请求的伪造头一律忽略。
浏览器直连写按 CORS 规则处理(读路径 `*`;写路径校验 `Origin ∈ api.allowedOrigins`,
显式凭证)。webmention 接收端点例外(发送方不可能持 key,维持开放接收 + 现有限流)。

| 头                                           | 含义                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <jwt>`                | 前端凭证(必带)                                                                                                                                                                                                                                                                                  |
| `X-Kobato-Comment-Token`                     | 游客身份连续性:core 在首次评论提交的响应经 `Set-Cookie: __comment_tokens=…` 签发/刷新整罐 token,前端回放进自己域的一方 cookie,后续经此头回带                                                                                                                                                    |
| `X-Kobato-Session-Token`                     | 会员身份回带:core 的 signin 在登录成功后对**白名单前端域**(`api.allowedOrigins`)的 `redirect_to` 重定向附加 `?session_token=<签名会话值>`;前端 root loader 把该值镜像进自己域的 `__session` cookie 并跳转到干净 URL,代理后续经此头回带。core 仅在有效 key 时解析(与 `X-Forwarded-*` 同信任规则) |
| `X-Forwarded-For` / `X-Forwarded-User-Agent` | 访客 IP/UA——仅有效 key 时采信(限流/analytics/审核)。IP 由前端代理自身推导(操作方反代头或直连 socket),浏览器可伪造的 `X-Forwarded-For` 一律不转发                                                                                                                                                |

写端点:`POST /api/content/v1/comments/reply`、`/likes/increase`、`/newsletter/subscribe`、`/friends/apply` 等。webmention 接收端点为开放端点(发送方不可能持 key),不受此约束。草稿预览与评论原文读取(`GET /content/v1/comments/get-raw`)是读端点,同样经代理以携带 token 罐。

## 错误约定

- 过程错误(过程端点与 `/api` 外围的 429/403)统一为 oRPC 信封:

```
{ "defined": false, "code": "NOT_FOUND", "status": 404, "message": "文章不存在" }
```

- `code` 取值:`NOT_FOUND`(404)/`BAD_REQUEST`(400)/`UNAUTHORIZED`(401)/`FORBIDDEN`(403)/`TOO_MANY_REQUESTS`(429)/`BAD_GATEWAY`(502)。校验失败(400)附带 `data.issues`(字段级错误数组)。
- 例外:请求体超限(413)仍为 `{ "error": { "message": "请求体过大" } }`(全局 body-limit 中间件,非过程面)。

## 草稿预览(跨域凭证)

两分部署下 core 的 session cookie 到不了公开前端,草稿预览鉴权走**短期 preview token**:

- **签发**:作者/管理员在 core 域(admin 编辑器)时,core 为每个编辑页加载签发角色绑定、
  30 分钟有效的 `preview_token`(HMAC,`security.sessionSecret` 签名);公开链接带上
  `?preview_token=…`(文章草稿自动生效;页面草稿仍需 `?draft=true`)。
- **验证**:`GET /content/v1/posts/:slug` 与 `/pages/:slug` 接受 `previewToken` 入参,
  token 只证明签发时的角色——文章草稿作者级、页面草稿仅 admin 级(与实体
  `canPreviewDraft` 适配器一致),过期/篡改即拒。
- **部署**:`public.frontendUrl` 配置前端域后,admin 编辑器自动生成绝对公开链接并附 token;
  未配置(同源部署)保持相对链接,session cookie 直接生效。
- 官方前端页面路由把 URL 里的 `preview_token` 原样透传给 core。

## 分页约定

列表端点(首页/分类/标签/搜索)支持 `num` 查询参数(页码字符串,`/page/N` 语义;`/page/1` 折叠到根,溢出 301 到最后一页)。响应含 `pageNum`/`totalPage`/`rootPath`。评论区列表 `offset` 游标分页。

## 日期约定

- JSON 输出中日期为 ISO 8601 字符串(`format: date-time`)。
- 服务端内部保留 `Date` 往返(typed client 拿回真 `Date`);REST 面一律 ISO 字符串。
- 相对时间文案(今天/昨天/N 天前)由前端按自身时区渲染(数据含 `listingNowIso` 供 SSR/hydration 对齐)。

## 限流

- 公开读:`api.readRateLimitPerMinute`(默认 300 req/min/IP);受信前端(配置 `api.trustedProxy`)豁免。
- 写端点维持现有限流;代理流量按透传 IP 计数(仅有效 key)。
