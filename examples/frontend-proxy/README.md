# frontend-proxy — 最小第三方前端参考实现

演示 headless 接入全链路:注册密钥 → 签发 JWT → 代理写交互(头族)→ 读 API。
兼作 headless e2e 测试床(`apps/core/tests/e2e/headless/frontend-proxy.test.ts` 以本目录
的 `proxyCommentSubmit` 为被测实现,对真实 core 跑读直连 + 写代理全链路)。

## 流程

1. **注册公钥**:admin 在 `/admin/security/keys` 注册你的 Ed25519 公钥(或页面上生成并下载私钥)。
2. **签发 JWT**:私钥 + keyId 交给 `createKeyAuthSigner`(见 `packages/sdk/src/signer.ts`)。
3. **读**:匿名请求 `GET /api/content/v1/home`(浏览器直连)或服务端 SDK 调 `/rpc`。
4. **写**:浏览器提交到你的服务端 → 组装代理头(`buildProxyHeaders`,见
   `packages/sdk/src/proxy.ts`)→ 转发 core。

## 参考代码

`src/proxy-example.ts` 演示第 2/4 步;token 流转见 `packages/sdk/src/token.ts` 的 jar 管理。
运行它需要环境变量:`KOBATO_FRONTEND_PRIVATE_KEY`、`KOBATO_FRONTEND_KEY_ID`、`KOBATO_CORE_API`。

## 与官方前端的差异

官方前端(`apps/public`)是同一模型的 dogfood 实现;本目录是任意技术栈的最小参照
(任何语言可复刻头族契约,契约见 `docs/headless-api.md`)。
