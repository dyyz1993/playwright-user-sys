// 开发模式启动脚本 - 支持 tsconfig paths
import { register } from 'tsconfig-paths';
import { tsx } from 'tsx';

// 注册 tsconfig paths
register({
  baseUrl: '.',
  paths: {
    '@/*': ['src/*'],
    '@shared/*': ['src/shared/*'],
    '@manager/*': ['src/manager/*'],
    '@machine/*': ['src/machine/*']
  }
});

// 动态导入入口文件
await import('./server.ts');
