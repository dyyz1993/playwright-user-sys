#!/bin/bash

echo "🔍 检查 SQLite3 预编译文件的兼容性..."
node check-compatibility.js

if [ $? -eq 0 ]; then
    echo "✅ 兼容性检查通过，预编译文件与当前环境兼容"
    exit 0
else
    echo "❌ 兼容性检查失败，预编译文件与当前环境不兼容"
    echo "请确保预编译文件与当前环境兼容，或者使用 Dockerfile 中的直接编译方式"
    exit 1
fi
