# 截图索引

全部 17 张图都在 `screenshots/` 里，README 直接引用，不用改代码。

想换成自己的截图：文件名保持不变，覆盖进去就生效。

> 115 授权、夸克扫码这类「网盘自己的规矩」不截图、也不写步骤——那是 OpenList 的文档范畴。

---

## 一、群晖 / 容器部署

| 文件 | 内容 | 用在 |
|---|---|---|
| `12-dsm-containers.png` | Container Manager → 容器 → `trimmedia` 详情（ID / 端口 8005 / 三条挂载 / PUID） | 1.2 |
| `04-login.png` | 飞牛影视登录页（FN-Media，admin / 123456） | 1.3 |

## 二、飞牛影视建库与修集号

| 文件 | 内容 | 用在 |
|---|---|---|
| `05-library.png` | 新建媒体库对话框：内容类型选「其他视频」、媒体文件夹选到 strm 子目录 | 5 |
| `15-library-list.png` | 媒体库列表：电影 / 电视节目 / 其他视频 混排的 5 个库 | 5.1 |
| `01-home.png` | 海报墙首页 | 首页头图 |
| `02-panel.png` | 条目详情页 + 右下角「豆瓣匹配助手」面板 | 6.3 |
| `03-episodes.png` | 修复后的选集列表（1–30 / 31–41，共 41 集） | 6.5 |

## 三、OpenList 挂载与 strm

| 文件 | 内容 | 用在 |
|---|---|---|
| `06-openlist-home.png` | OpenList 登录后首页（挂载点列表） | 2.3 |
| `07-openlist-storages.png` | 存储列表：网盘驱动 + STRM 驱动，状态「工作中」 | 3.2 |
| `08-add-strm.png` | 添加存储 → 驱动下拉筛 `Str` → 选中 Strm | 4.1 |
| `08a-strm-basic.png` | Strm 表单上半：驱动 / 挂载路径 / WebDAV 策略 | 4.1 |
| `09-strm-path.png` | Strm 关键字段：路径 / 站点 URL（**域名已打码**）/ 路径前缀 / 文件类型 | 4.1 |
| `10-strm-local.png` | 保存 Strm 到本地 + 本地路径 `/strm/115` + 同步模式 | 4.1 |
| `11-openlist-index.png` | 管理 → 索引 → 手动扫描（扫描路径 / 限制速率 / 开始） | 4.2 |

## 四、strm 落地的样子

| 文件 | 内容 | 用在 |
|---|---|---|
| `13-dsm-folders-1.png` | 剧集合集目录：19 个文件夹 = 19 季，名字照抄网盘 | 4.3 |
| `13-dsm-folders-2.png` | 季目录里的 `.strm` 文件列表，含 `01 上` / `01 下` 拆集 | 4.3、6.5 |

## 五、插件怎么用豆瓣

| 文件 | 内容 | 用在 |
|---|---|---|
| `14-douban-search.png` | 豆瓣搜索「权力的游戏」→ 右键复制条目链接，状态栏显示 subject ID | 6.4 |

---

## 打码规则（重新截图时照着做）

必须打码：

- **公网域名**（`xxx.xyz`、DDNS 名）
- **token / 密码 / Cookie / 二维码 / 手机号 / 邮箱**
- **115 / 夸克的账号 ID、app_id、app_secret**
- 群晖的**序列号、QuickConnect ID**

不用打码：

- 影片名、海报、剧集列表
- 局域网 IP（`192.168.x.x`）、端口号、容器名、路径、UID

打码方式：**实心色块涂黑**，别用高斯模糊（模糊可以被还原，涂黑不会）。

> `09-strm-path.png` 的「站点 URL」就是这么处理的：截图前把输入框的**显示值**改成 `https://你的域名:50443`，全程没保存、没落库。

---

## 换图之后

```bash
cd ~/Desktop/fntv-douban-kit
git add screenshots/
git commit -m "docs: 更新截图"
git push
```

传完在 GitHub 页面上逐张点开看一眼：图能显示、没有 404、没有漏打的域名。
