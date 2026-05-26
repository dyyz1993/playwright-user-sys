import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Playwright User Sys',
  description: '分布式 Playwright 浏览器管理系统',

  lastUpdated: true,
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API', link: '/api/rest-api', activeMatch: '/api/' },
      { text: 'SDK', link: '/sdk/client-sdk', activeMatch: '/sdk/' },
      { text: '部署', link: '/deploy/docker', activeMatch: '/deploy/' },
      {
        text: 'GitHub',
        link: 'https://github.com/dyyz1993/playwright-user-sys',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '系统架构', link: '/guide/architecture' },
            { text: '配置说明', link: '/guide/configuration' },
          ],
        },
        {
          text: '进阶',
          items: [
            { text: '最佳实践', link: '/guide/best-practices' },
            { text: '性能优化', link: '/guide/performance' },
            { text: '安全加固', link: '/guide/security' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: 'FAQ 常见问题', link: '/guide/faq' },
            { text: '错误排查', link: '/guide/troubleshooting' },
          ],
        },
        {
          text: '贡献',
          items: [
            { text: '贡献指南', link: '/guide/contributing' },
            { text: '更新日志', link: '/guide/changelog' },
          ],
        },
        {
          text: '教程',
          items: [
            { text: '交互式 Demo', link: '/guide/demo' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'REST API', link: '/api/rest-api' },
            { text: 'WebSocket API', link: '/api/websocket' },
            { text: '认证机制', link: '/api/authentication' },
          ],
        },
      ],
      '/sdk/': [
        {
          text: 'SDK 使用',
          items: [
            { text: 'Client SDK', link: '/sdk/client-sdk' },
            { text: '会话管理', link: '/sdk/session-management' },
            { text: 'CDP 直连', link: '/sdk/cdp-direct' },
          ],
        },
      ],
      '/deploy/': [
        {
          text: '部署指南',
          items: [
            { text: 'Docker 部署', link: '/deploy/docker' },
            { text: '手动部署', link: '/deploy/manual' },
            { text: '环境变量', link: '/deploy/environment-variables' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dyyz1993/playwright-user-sys' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Apache-2.0 WITH Commons-Clause License',
    },
  },
})
