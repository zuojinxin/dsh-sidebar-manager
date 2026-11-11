# 右侧面板入口验证

目标：在 `dsh-sidebar-manager` 0.10.1 的同一编辑态中，管理 DSH 默认「开始」页的右侧入口。基线为上游 `main` 的 `f99aa12d5abf6bfedab5c5237225d57d8e2547de`。

## 实际执行

在仓库根目录执行；本机复用了已有 `jsdom`，没有增加运行时依赖。下方将 `SNC_JSDOM` 的本机绝对路径以占位符显示。

```bash
SNC_JSDOM="<existing-jsdom-path>" npm test
node --check lib/client.js
node --check lib/index.js
node --check test/ego-check.mjs
ego-browser skill
npm run test:browser
npm pack --dry-run --json
git diff --check
```

- 修改前：原有 76 项测试通过；新增 8 项右侧回归在实现前全部失败。
- 最终 Node 测试：88 passed，0 failed。覆盖复合终端卡片、显示恢复、排序持久化、旧 v2 配置、动态挂载、多实例、无关节点隔离、失效控件清理、无障碍移动按钮、连续键盘排序的焦点保留和禁用恢复。
- 语法检查：三个 JavaScript 入口均退出 0。
- ego 浏览器：退出 0，输出 `PASS: default/edit/drag/buttons/reload/keyboard/narrow/dark/teardown`；使用真实指针拖动、原生勾选框和键盘操作。
- 打包预检：退出 0，仅包含 LICENSE、README、cordis.patch.yml、lib/client.js、lib/index.js、package.json。
- 差异空白检查：退出 0。

## 界面检查

| 项目 | 结果 | 原因 |
|---|---|---|
| 默认态 | PASS | 编辑控件隐藏；宿主入口保留原操作。 |
| 编辑态 | PASS | 原齿轮同时管理三个区域；右侧隐藏项仍可恢复。 |
| 排序交互 | PASS | 真实拖动在释放时保存；上移、下移按钮也能排序。 |
| 控件命名与键盘 | PASS | 勾选框、移动按钮有可读名称；Space 和 Enter 操作通过。 |
| 窄侧栏 | PASS | 260px 侧栏编辑项无横向溢出。 |
| 深色主题 | PASS | 切换宿主色板后交互和布局检查通过；新控件使用宿主颜色变量。 |
| 减少动态效果 | PASS | 位移动画沿用已有 `prefers-reduced-motion` 分支，新增右侧样式关闭过渡。 |
| 减少透明效果 | N/A | 没有新增半透明背景或模糊；隐藏项沿用原插件的状态淡化。 |
| 增强对比度 | N/A | 没有新增自定义色板；采用宿主色板。 |
| 文案删除测试 | PASS | 新增可见文字仅为现有入口标题；移动按钮用图标和可读名称。 |
| 继承的夹具字号及灰色 | N/A | 匿名示意页有意保留宿主外壳的既有样式；本地检测例外仅作用于该文件，不随 PR 提交。 |

截图：[编辑态](./screenshots/04-right-editing.png)、[隐藏与排序后](./screenshots/05-right-customized.png)。

## 范围与限制

运行真实插件的匿名页面按本机 DSH 0.2.2-rc.1 的 DOM 契约构建，包含 `entryCell > div[data-sidebar-right-guide-entry="terminal"]` 内的启动按钮与 shell 菜单。它验证插件和浏览器行为，不能替代原生 Desktop 集成验收。本次没有修改 Desktop profile、安装插件或启动桌面应用。

只控制「开始」页入口；已打开的右侧面板不会因隐藏入口而关闭。沿用现有 v2 单记录偏好，旧字段缺失时安全使用默认值；降级到旧插件会由旧代码丢弃右侧新增字段，重新升级后需要重新设置。替换默认开始页或宿主改变 DOM 标记时可能需要适配。
