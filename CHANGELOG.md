# 更新日志

本文件记录「Redou的博客」的版本变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.0] - 2026-09-24

主题由 PaperMod 迁移到 Stack，站点结构与构建方式一并重构。**所有旧链接保持不变。**

### 新增

- 更换主题为 **Stack v4.0.3**（以 git submodule 引入，钉在 release tag 上）
- 配置文件拆分为 `config/_default/`：`hugo.toml`、`params.toml`、`languages.toml`、`menu.toml`
- 文章改为 page bundle（一篇文章一个目录，正文与封面、插图放在一起）
- 文章封面与分类配图改为本地脚本生成（`scripts/gen-images.mjs`，纯 Node，无第三方依赖，不依赖图床）
- 站内功能：搜索、右侧目录、相关文章、阅读时间、暗色模式、按年归档、分类与标签页
- 新增分类入口：技术、设计、阅读、像素画、游戏开发、杂谈
- 新增栏目导航：像素画记录、杂谈分享、游戏开发
- 新增 9 篇文章：技术 3 篇、设计 3 篇、阅读 3 篇
- 新增构建冒烟测试 `scripts/verify-build.mjs`（页面、搜索索引、分类、样式共 28 项检查）
- 新增本更新日志

### 变更

- **构建用 Hugo 由普通版改为 extended 版**。Stack 使用 SCSS，普通版会直接构建失败，CI 工作流中的下载地址已相应调整
- 文章标题层级规范化：
  - 去掉 3 篇正文中与页面标题重复的一级标题（`用 AI + CMD 整理电脑文件`、`follow your passion真的是对的嘛？`、`关于我`）
  - `简单的markdown语法笔记` 的小节标题由 H1 降为 H2，使右侧目录能正确显示层级（代码块内的示例不受影响）
- 导航由顶部横向导航栏改为左侧侧栏，并补充社交图标（GitHub、RSS）
- 页脚信息更新：起始年份 2024，并标注站点版本

### 移除

- 移除 PaperMod 主题子模块
- 移除误提交的 `hug22o.yaml`（一份他人的 Stack 配置，内含他人域名与标题）

### 保持不变（重要）

- 文章 URL：`/posts/<文章标题>/`
- 页面 URL：`/about/`、`/archives/`、`/friends/`、`/search/`
- 栏目 URL：`/gamedev/`、`/pixelart/`、`/talk/`
- 站点名「Redou的博客」、作者、头像图片、RSS 地址（`/index.xml`）
- 全部文章正文内容（仅上文的标题层级调整）

## [1.0.0] - 2024-01-14 起（PaperMod 时期）

- 使用 Hugo + PaperMod 主题建立博客，GitHub Actions 自动部署到 GitHub Pages
- 内容方向：游戏开发、像素画、AI 与学习笔记
- 备注：仓库历史于 2026-09-23 重建（`replace blog with clean Hugo project`），此前的提交记录不再保留
