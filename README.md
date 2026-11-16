# dsh-sidebar-manager

让 DSH 的扩展入口和视图标签支持**折叠、排序、隐藏**。

[![npm version](https://img.shields.io/npm/v/dsh-sidebar-manager?style=flat&label=npm)](https://www.npmjs.com/package/dsh-sidebar-manager) [![DSH](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.3-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness) [![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE) [![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

![折叠、展开、隐藏、拖拽排序的完整交互](https://raw.githubusercontent.com/zuojinxin/dsh-sidebar-manager/main/docs/images/demo.gif)

<details>
<summary>静态界面预览</summary>

![折叠后：扩展组收成一行「扩展」，入口全部隐藏，下方直接是工作区](https://raw.githubusercontent.com/zuojinxin/dsh-sidebar-manager/main/docs/screenshots/01-folded.png)

![编辑态：每行前出现拖拽手柄和勾选框，取消勾选即隐藏](https://raw.githubusercontent.com/zuojinxin/dsh-sidebar-manager/main/docs/screenshots/03-editing.png)

![退出编辑后：隐藏了多余入口、标签，并调整过顺序](https://raw.githubusercontent.com/zuojinxin/dsh-sidebar-manager/main/docs/screenshots/02-expanded.png)

</details>

> 动图与截图在[匿名示意页](https://github.com/zuojinxin/dsh-sidebar-manager/blob/main/docs/preview.html)中**运行真实插件**生成，面板名与工作区名为虚构数据，不含任何真实会话或账号。

## 功能

- **折叠**：点标题行收起左侧整组扩展入口
- **隐藏**：点齿轮进入编辑态，点整行即可切换该入口或视图标签的显示（勾选框照样可用）
- **排序**：编辑态下拖整行调整顺序，侧栏上下拖，标签左右拖
- **续命宿主图钉**：宿主自带的「从左侧栏取消固定」按钮，宿主只把选择存在内存里（重载即还原）。本插件记住这个选择，下次启动时再替用户按一次那个原生按钮，于是行照旧离开侧栏、照旧出现在「更多」菜单里——行为仍是宿主的，只是不再丢
- **同名入口**：DSH 给每个面板行只渲染名称（`aria-label`），不渲染 id，所以光看 DOM 两个同名入口分不开。本插件改为读宿主的**插槽注册表**（`ctx.get('slots').entriesOfSlot('sidebar.panellist')`，宿主自己的侧栏也是从这里读 id 的），记录以面板 **id** 为键，同名也能各管各的。图钉按其自身控件判定，按一次只移除一条；重放一个记录也只按一次，不会因为同名把另一条一起取消
- **只管理还存在的入口**：记录只在明确时机清理——启动后、进入编辑态、页面重新可见。这三个时刻整个列表都渲染完毕，「没有这一行」才是真证据；平时重绘时行会短暂消失，那时一律不动记录，避免把用户设置误删

设置自动保存，刷新后仍在。

## 安装

从 npm 安装：

```bash
dsh plugin --profile desktop add dsh-sidebar-manager
```

从 GitHub 安装：

```bash
dsh plugin --profile desktop add 'github:zuojinxin/dsh-sidebar-manager'
```

装完重启 DSH 桌面版生效。

## 说明

- 面向 DeepSeek Harness 0.2.2-rc.3。插件靠宿主 CSS 类名定位，DSH 升级后可能需要适配。
- 「对话」标签不可隐藏（默认视图，藏掉中间会变空）；正在看的标签也不可隐藏。
- **宿主图钉的边界**：图钉是宿主的控件，本插件不复制它、也不把「取消固定」当成「隐藏」——取消固定的入口会离开侧栏并进入宿主自己的「更多」菜单，那里有反向的空心图钉；隐藏则是本插件的事，两者是不同的语义、分开存储。本插件只做两件事：记住用户按过哪个图钉（`pins` 列表），以及下次挂载时把这个选择重放到那个原生按钮上。因此：
  - 宿主哪天自己做了持久化：它不会再渲染那些行，重放找不到可按的按钮，自动退化成空操作，不会和宿主抢状态。
  - 宿主哪天去掉了图钉或改了类名：重放那段不触发，其余功能不受影响；`pins` 记录原样保留，等有图钉的版本再恢复。
  - 宿主哪天改了「更多」菜单的结构：反向（重新固定）不需要本插件识别——它读的是行进出列表这个事实，不读按钮。
  - **怎么区分「你按了图钉」和「插件卸载了」**：两者都表现为行消失。插件只在三个明确时机（启动、进入编辑态、页面重新可见）清一次失效记录，其余时候只看「真的观察到这次图钉按下」。重绘导致的短暂消失不会误删任何设置。
  - **同名入口**：记录以面板 id 为键（id 来自插槽注册表）。读不到注册表的老版本会自动退回按名称，行为与从前一致。若两个入口同名且图标也相同（通常是同一插件注册了两个入口），按名称合并处理。
  - **升级迁移**：旧版本记录存在名称下，新版本存在 id 下。启动时会先把旧名称翻译成对应 id 再判断存亡，所以升级不会丢设置。
- 禁用插件后，页面上由它添加的元素和样式会全部移除（重放随之停止，宿主恢复原生内存行为）。

## 开发

```bash
npm install --no-save jsdom
node --test test/client.test.js
```

## 许可

[MIT](./LICENSE)，基于 [nico-zhuang/dsh-sidebar-nav-collapse](https://github.com/nico-zhuang/dsh-sidebar-nav-collapse) 重写。
