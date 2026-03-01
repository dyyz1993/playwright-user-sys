// 机器端入口文件 - 向后兼容
// 此文件保留用于向后兼容，实际入口已迁移到 src/machine/app.ts 和 src/machine/server.ts

// 重新导出所有内容以保持向后兼容
export { MachineServer, MachineState, startMachine, stopMachine, getMachineServer } from './app.js';
