# Chrome 文件准备指南

本指南说明如何准备Chrome浏览器文件，以便在Docker容器中运行Playwright实例机器。

## 获取Chrome文件

### 方法1：从已安装的Chrome中提取（Linux）

如果您有Linux系统并已安装Chrome：

```bash
# 找到Chrome安装目录
which google-chrome

# 创建目标目录
mkdir -p ./chrome

# 复制Chrome文件和相关依赖
cp -r /opt/google/chrome/* ./chrome/

# 确保chrome可执行文件有执行权限
chmod +x ./chrome/chrome
```

### 方法2：下载Chrome Deb包并提取

```bash
# 创建工作目录
mkdir -p ./chrome-temp && cd ./chrome-temp

# 下载Chrome Deb包
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

# 提取Deb包
ar x google-chrome-stable_current_amd64.deb
tar -xvf data.tar.xz

# 复制Chrome文件到目标目录
mkdir -p ../chrome
cp -r ./opt/google/chrome/* ../chrome/

# 返回项目目录
cd ..
rm -rf ./chrome-temp

# 确保chrome可执行文件有执行权限
chmod +x ./chrome/chrome
```

### 方法3：使用Chromium（推荐）

```bash
# 创建Chrome目录
mkdir -p ./chrome

# 安装Chromium（如果尚未安装）
sudo apt-get update
sudo apt-get install -y chromium

# 复制Chromium文件
cp -r /usr/bin/chromium ./chrome/chrome
cp -r /usr/lib/chromium/* ./chrome/

# 确保chrome可执行文件有执行权限
chmod +x ./chrome/chrome
```

## 验证Chrome文件

确保您的Chrome目录包含以下关键文件：

```
chrome/
├── chrome                  # Chrome可执行文件（必需）
├── chrome_100_percent.pak  # 资源包（通常需要）
├── chrome_200_percent.pak  # 高DPI资源包（通常需要）
├── resources.pak           # 资源包（通常需要）
├── lib/                    # 库文件目录（通常需要）
└── ...                     # 其他Chrome文件
```

您可以运行以下命令验证：

```bash
# 检查Chrome可执行文件是否存在
./chrome/chrome --version

# 如果成功，应该显示Chrome版本信息
```

## 使用Chrome文件

1. 将准备好的Chrome目录放在项目根目录下
2. 使用docker-compose启动服务：

```bash
docker-compose -f docker-compose.example.yml up -d
```

3. 或者使用docker run命令：

```bash
docker run -d \
  --name playwright-machine \
  -v $(pwd)/chrome:/opt/chrome:ro \
  -e MANAGEMENT_SERVER_URL=http://your-management-server:3000 \
  -p 8082:8082 \
  ghcr.io/dyyz1993/playwright-user-sys:machine
```

## 注意事项

- 确保Chrome文件与您的容器架构匹配（通常是x86_64）
- Chrome目录必须包含名为`chrome`的可执行文件
- 如果没有提供Chrome文件，容器启动时会显示警告并在30秒后退出
- 推荐使用官方Chrome或Chromium浏览器的稳定版本
- 使用只读映射（`:ro`）可以防止容器意外修改Chrome文件

## 故障排除

### 容器启动失败

1. 检查Chrome目录是否存在：
   ```bash
   ls -la ./chrome
   ```

2. 检查chrome可执行文件是否存在且有执行权限：
   ```bash
   ./chrome/chrome --version
   ```

3. 查看容器日志：
   ```bash
   docker logs playwright-machine
   ```

### Chrome版本兼容性

- 推荐使用Chrome 90+版本
- 确保Chrome版本与Playwright兼容
- 可以在Playwright官网查看支持的浏览器版本

### 架构不匹配

- 确保Chrome文件与容器架构匹配（x86_64）
- 如果在ARM架构上运行，需要使用ARM版本的Chrome