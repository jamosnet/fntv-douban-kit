// ==UserScript==
// @name         飞牛影视 豆瓣匹配助手
// @name:en      Feiniu Douban Helper
// @namespace    https://github.com/jamosnet/fntv-douban-kit
// @version      1.3.16-20261127
// @description  给飞牛影视网页版添加"豆瓣匹配"和"集号修复"入口。豆瓣匹配：官方手动匹配无豆瓣来源，本脚本支持；本地 NFO 库自动降级为直接写入。集号修复：文件名裸数字/无集号标记导致全部归入"特别篇"（0季0集）时，按文件名批量重编季/集号。
// @description:en Add Douban metadata matching and batch episode renumbering to the Feiniu (fnOS / trimmedia) web UI.
// @author       jamosnet
// @homepageURL  https://github.com/jamosnet/fntv-douban-kit
// @supportURL   https://github.com/jamosnet/fntv-douban-kit/issues
// @updateURL    https://raw.githubusercontent.com/jamosnet/fntv-douban-kit/main/fntv-douban-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/jamosnet/fntv-douban-kit/main/fntv-douban-helper.user.js
// @license      MIT
// @match        *://*/v/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      m.douban.com
// @connect      doubanio.com
// @connect      *
// @run-at       document-start
// ==/UserScript==

/*
* ==============================================================================
* 📜 脚本版本全量演进履历 (Changelog) - 严禁删除！
* ==============================================================================
* [v1.0.0] - 2026-11-24 初版：豆瓣 ID 预览 + 在线匹配（rescrap）；内嵌 blueimp-md5，authx 签名与 Python 客户端逐字节对拍一致。
* [v1.1.0] - 2026-11-24 目录页模式：/v/folder/ 下列出目录内条目点选匹配；SPA 路由监听，切换页面自动重建面板。
* [v1.2.0] - 2026-11-24 凭证捕获改 XHR.setRequestHeader + fetch 双通道；修复无凭证时按钮永久卡死；请求加 60s 超时。
* [v1.3.0] - 2026-11-24 本地 NFO 库直写降级：在线匹配被服务端忽略时，按豆瓣数据直写海报/简介/年份/评分/演职员（只填空缺、不覆盖已有）。
* [v1.3.1] - 2026-11-25 新增【修复集号（批量）】：按文件名解析集号批量重编季/集，修复“全部 0 季 0 集显示为特别篇”；修复 /v/tv/season/ 两级路径的 guid 识别。
* [v1.3.2] - 2026-11-25 集号解析修复：兜底由“取第一个数字”改为“取最后一个独立数字块”，并跳过分辨率(1080/2160…)、年份、S16/X2 之类标记。此前「乡村爱情S16 01 4K.strm」被解析成第 16 集，41 个文件全部撞号弹出重复提示。另新增：提交前弹解析预览确认；撞号时提示改用【按文件名顺序编号】；新增该模式复选框。
* [v1.3.3] - 2026-11-25 🚫 已废弃回退：曾把撞号语义改成「同集多版本照常提交」，经确认不适用（用户库里确有重复文件但希望按序号 1–41 顺排，重复的顺移占下一集），现恢复 1.3.2 行为，勿再使用该改动。
* [v1.3.4] - 2026-11-25 首个公开发布版：功能与 1.3.2 完全一致（1.3.3 已废弃）。补齐 @updateURL / @downloadURL 等自动更新元数据，@license MIT。（曾短暂改用纯 semver 1.4.0，按规范恢复「patch-日期」格式）
* [v1.3.5] - 2026-11-27 新增【标题排序修复】区块（曾为 1.5.0）：配合 trimmedia-ext 旁路容器（README 第 8 章）修复官方 sort_title 字典序 bug（1,10,11,2 乱序）。预览→确认→执行两段式；地址自动按「当前端口+1」寻址（2290→2291），也可手动指定（域名走 Caddy2 路径反代）；鉴权直接转发页面登录 token，ext 回官方验证 is_admin，无需填任何新 token。
* [v1.3.6] - 2026-11-27 排序修复去掉必填前缀（曾为 1.6.0）：默认一键扫描全库，「剧名+数字」系列自动分组（单条不碰），前缀输入降级为可选过滤；面板 tab 化（豆瓣匹配 / 排序修复 分页，解决面板拥挤）；新增标题栏拖动移动 + 右下角调宽，位置/宽度均记忆。
* [v1.3.7] - 2026-11-27 排序扫描范围自动限定当前媒体库（用户反馈：全库扫描出 4199 处，把单集标题全当成系列了）：自动从当前页面 URL 取库 guid 传给 ext（item_ancestor 祖先链过滤）；同时服务端排除季/集级条目（season/episode 编号非空的条目一律不碰），只在剧/电影级条目里找系列。预览显示扫描范围。
* [v1.3.8] - 2026-11-27 修复范围过滤在真实库圈空（用户反馈：合集页扫描报"没有需要排序的序列"，实际 1,10,11,2 明显乱序）：真实库 item_ancestor 不含库 guid，范围过滤落空成 0 条。服务端改三通道范围（guid 自身 ∪ item_ancestor 祖先链 ∪ parent_guid 递归子树，CTE 种子不再要求库节点在 item 表内），三通道全落空时自动回退全库并显式标记 fallback；响应新增 scanned（实际扫描条目数）供面板展示。面板新增「范围跟随当前页面」勾选框（取消=扫全库），结果区显示扫描条目数与回退警告。
* [v1.3.9] - 2026-11-27 新增「手动改值」tab（用户洞察：sortfix 正则只救得了「剧名+数字」规整命名，救不了「权力的游戏 第X季」这类中文序数——通用解是手动改「标题 / 发行时间」两个值，让任意排序模式自然正确）。在条目详情页自动带出当前标题/发行时间/sort_title，改标题可勾选同步 sort_title（官方「标题」排序读该字段），改发行时间同步写 air_date+first_air_date。走 patch 模块 preview→apply 两段式+自动备份。ext 升级 1.2.0：patch 白名单补 sort_title/air_date/first_air_date/release_date，新增只读 /api/item/preview 按 guid 取可编辑字段。sortfix 保留（规整命名批量补零仍是它最快）。
* [v1.3.10] - 2026-11-27 按用户决定作废「排序修复」tab 并整体移除：场景有限，新用户容易困惑，开发者自己也不再使用（批量能力仅保留 ext /api/sortfix 供命令行）。手动改值 tab 改造：① sort_title 从隐藏同步项升级为独立可见可编辑字段（官方「标题」排序读的就是它，用户实测改标题后排序不变就是因为这字段要单独改）；② 去掉二次确认——一键直写，按钮红色醒目+面板常驻警示条（改错可改回+自动备份可恢复+改完若界面没变重启 trimmedia 容器刷新官方内存缓存）。扩展服务地址输入框移入本 tab。
* [v1.3.11] - 2026-11-27 文案正式化（用户反馈）：①「排序值」叫法有歧义，字段名统一直接用 sort_title，说明行加补零规则（同前缀+补零两位数字，1/2/10 与中文数字都会乱序）；② 警示条改为正式措辞（直接写库请核对后保存 / 保存前自动备份可经 /api/backups/restore 恢复 / 未显示新值请重启 trimmedia 容器）。配套 ext 1.2.1 删除 sortfix 模块（面板已作废，残留代码徒增维护负担）。
* [v1.3.12] - 2026-11-27 寻址约定延伸到域名模式（用户反馈：配了 Caddy2 后端口+1 失效还得手动填地址，约定不该断）：端口+1 之外新增域名兜底——location.port 为空时自动按「当前域名 + /fntv-ext」寻址，与 README 4.6/8.3 的 Caddy handle_path /fntv-ext/* 片段一致，两种访问方式都零配置；手动输入框降级为纯覆盖项（仅反代路径不是 /fntv-ext 时才需要填）。
* [v1.3.13] - 2026-11-27 修正 v1.3.12 的错误判断（用户指出：域名访问实际带端口，README 4.6 就是 https://域名:50443，此时 location.port 是数字，端口+1 会错误触发指向 域名:50444）：判据从「有没有端口」改为「主机是 IP 还是域名」——IPv4/localhost + 数字端口才走端口+1，域名（带不带端口都算）一律走 当前域名+/fntv-ext（origin 自带端口，https://域名:50443/fntv-ext 正确命中 Caddy）。
* [v1.3.14] - 2026-11-27 新增【特别篇检查】（用户需求：全库一批 季=0集=0 的集实际是集号错乱，要能一键列出并手动修正）：库页用 /item/list ancestor_guid 形式列剧后逐层下钻（真库实测 75 部剧 171 次调用 20 秒），命中集取 /media/itemfile 拿文件名+media_guid（列表响应 file_name 为空，必须单集取）；按剧分组展示、集号按文件名预填、逐行可改季/集；提交走 /scrap/rescrap/batch（与修复集号同通道，服务端自动重建季节结构），按剧分批+逐批进度。纯官方 API，ext 无改动。
* [v1.3.15] - 2026-11-27 特别篇检查改为全库发现模式（用户纠正：功能目的是「发现哪些剧需要处理」，不是扫当前打开的剧——剧都打开了还要扫描毫无意义）：无论在哪个页面点，一律 /item/list 不带 ancestor_guid 扁平拉全库条目取所有 TV 逐部下钻（实测全库 418 条目、约 90 部剧），结果按剧折叠分组（剧名+条数，默认收起），点开某部剧才逐集取文件名并预填季/集，按剧单独提交 rescrap/batch；按钮文案改「扫全库，找出带特别篇的剧」，去掉页面类型限制。
* [v1.3.16] - 2026-11-27 面板排版重整（用户反馈截图排版问题）：①豆瓣匹配 tab 按功能分两组（豆瓣匹配 / 集号修复），组间加小节标题+分隔线；②控件规格统一——输入框/下拉/按钮统一 28px 高、12px 字号、6px 圆角，主按钮（开始豆瓣匹配/保存修改）32px；③颜色收敛三档：主操作蓝实心、常规操作中性描边或绿实心、诊断工具（特别篇检查）橙描边次级样式；④「开始豆瓣匹配」从面板垫底移回匹配组末尾；⑤豆瓣链接标签单行化，长示例挪进 placeholder；⑥手动改值 tab 输入框同步统一规格。纯样式调整，逻辑零改动。
* ==============================================================================
*/

/* ========= md5：blueimp-md5 2.19.0 (MIT)，已与 Python hashlib 逐字节对拍验证 ========= */
!function(n){"use strict";function d(n,t){var r=(65535&n)+(65535&t);return(n>>16)+(t>>16)+(r>>16)<<16|65535&r}function f(n,t,r,e,o,u){return d((u=d(d(t,n),d(e,u)))<<o|u>>>32-o,r)}function l(n,t,r,e,o,u,c){return f(t&r|~t&e,n,t,o,u,c)}function g(n,t,r,e,o,u,c){return f(t&e|r&~e,n,t,o,u,c)}function v(n,t,r,e,o,u,c){return f(t^r^e,n,t,o,u,c)}function m(n,t,r,e,o,u,c){return f(r^(t|~e),n,t,o,u,c)}function c(n,t){var r,e,o,u;n[t>>5]|=128<<t%32,n[14+(t+64>>>9<<4)]=t;for(var c=1732584193,f=-271733879,i=-1732584194,a=271733878,h=0;h<n.length;h+=16)c=l(r=c,e=f,o=i,u=a,n[h],7,-680876936),a=l(a,c,f,i,n[h+1],12,-389564586),i=l(i,a,c,f,n[h+2],17,606105819),f=l(f,i,a,c,n[h+3],22,-1044525330),c=l(c,f,i,a,n[h+4],7,-176418897),a=l(a,c,f,i,n[h+5],12,1200080426),i=l(i,a,c,f,n[h+6],17,-1473231341),f=l(f,i,a,c,n[h+7],22,-45705983),c=l(c,f,i,a,n[h+8],7,1770035416),a=l(a,c,f,i,n[h+9],12,-1958414417),i=l(i,a,c,f,n[h+10],17,-42063),f=l(f,i,a,c,n[h+11],22,-1990404162),c=l(c,f,i,a,n[h+12],7,1804603682),a=l(a,c,f,i,n[h+13],12,-40341101),i=l(i,a,c,f,n[h+14],17,-1502002290),c=g(c,f=l(f,i,a,c,n[h+15],22,1236535329),i,a,n[h+1],5,-165796510),a=g(a,c,f,i,n[h+6],9,-1069501632),i=g(i,a,c,f,n[h+11],14,643717713),f=g(f,i,a,c,n[h],20,-373897302),c=g(c,f,i,a,n[h+5],5,-701558691),a=g(a,c,f,i,n[h+10],9,38016083),i=g(i,a,c,f,n[h+15],14,-660478335),f=g(f,i,a,c,n[h+4],20,-405537848),c=g(c,f,i,a,n[h+9],5,568446438),a=g(a,c,f,i,n[h+14],9,-1019803690),i=g(i,a,c,f,n[h+3],14,-187363961),f=g(f,i,a,c,n[h+8],20,1163531501),c=g(c,f,i,a,n[h+13],5,-1444681467),a=g(a,c,f,i,n[h+2],9,-51403784),i=g(i,a,c,f,n[h+7],14,1735328473),c=v(c,f=g(f,i,a,c,n[h+12],20,-1926607734),i,a,n[h+5],4,-378558),a=v(a,c,f,i,n[h+8],11,-2022574463),i=v(i,a,c,f,n[h+11],16,1839030562),f=v(f,i,a,c,n[h+14],23,-35309556),c=v(c,f,i,a,n[h+1],4,-1530992060),a=v(a,c,f,i,n[h+4],11,1272893353),i=v(i,a,c,f,n[h+7],16,-155497632),f=v(f,i,a,c,n[h+10],23,-1094730640),c=v(c,f,i,a,n[h+13],4,681279174),a=v(a,c,f,i,n[h],11,-358537222),i=v(i,a,c,f,n[h+3],16,-722521979),f=v(f,i,a,c,n[h+6],23,76029189),c=v(c,f,i,a,n[h+9],4,-640364487),a=v(a,c,f,i,n[h+12],11,-421815835),i=v(i,a,c,f,n[h+15],16,530742520),c=m(c,f=v(f,i,a,c,n[h+2],23,-995338651),i,a,n[h],6,-198630844),a=m(a,c,f,i,n[h+7],10,1126891415),i=m(i,a,c,f,n[h+14],15,-1416354905),f=m(f,i,a,c,n[h+5],21,-57434055),c=m(c,f,i,a,n[h+12],6,1700485571),a=m(a,c,f,i,n[h+3],10,-1894986606),i=m(i,a,c,f,n[h+10],15,-1051523),f=m(f,i,a,c,n[h+1],21,-2054922799),c=m(c,f,i,a,n[h+8],6,1873313359),a=m(a,c,f,i,n[h+15],10,-30611744),i=m(i,a,c,f,n[h+6],15,-1560198380),f=m(f,i,a,c,n[h+13],21,1309151649),c=m(c,f,i,a,n[h+4],6,-145523070),a=m(a,c,f,i,n[h+11],10,-1120210379),i=m(i,a,c,f,n[h+2],15,718787259),f=m(f,i,a,c,n[h+9],21,-343485551),c=d(c,r),f=d(f,e),i=d(i,o),a=d(a,u);return[c,f,i,a]}function i(n){for(var t="",r=32*n.length,e=0;e<r;e+=8)t+=String.fromCharCode(n[e>>5]>>>e%32&255);return t}function a(n){var t=[];for(t[(n.length>>2)-1]=void 0,e=0;e<t.length;e+=1)t[e]=0;for(var r=8*n.length,e=0;e<r;e+=8)t[e>>5]|=(255&n.charCodeAt(e/8))<<e%32;return t}function e(n){for(var t,r="0123456789abcdef",e="",o=0;o<n.length;o+=1)t=n.charCodeAt(o),e+=r.charAt(t>>>4&15)+r.charAt(15&t);return e}function r(n){return unescape(encodeURIComponent(n))}function o(n){return i(c(a(n=r(n)),8*n.length))}function u(n,t){return function(n,t){var r,e=a(n),o=[],u=[];for(o[15]=u[15]=void 0,16<e.length&&(e=c(e,8*n.length)),r=0;r<16;r+=1)o[r]=909522486^e[r],u[r]=1549556828^e[r];return t=c(o.concat(a(t)),512+8*t.length),i(c(u.concat(t),640))}(r(n),r(t))}function t(n,t,r){return t?r?u(t,n):e(u(t,n)):r?o(n):e(o(n))}"function"==typeof define&&define.amd?define(function(){return t}):"object"==typeof module&&module.exports?module.exports=t:n.md5=t}(this);
//# sourceMappingURL=md5.min.js.map

/* ========= 2. 脚本主体 ========= */
(function() {
  'use strict';
  var MD5 = (typeof md5 === 'function') ? md5 : (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.md5 === 'function' ? unsafeWindow.md5 : null);
  if (!MD5) { console.error('[豆瓣助手] md5 库未加载'); return; }

  var SECRET = 'NDzZTVxnRKP8Z0jXg1VAMonaG8akvh';
  var API_KEY = '16CCEB3D-AB42-077D-36A1-F355324E4237';

  /* --- 凭证捕获：飞牛前端用 axios（底层 XMLHttpRequest），必须钩 XHR 才能拿到 Authorization；fetch 钩子保留兜底 --- */
  var token = null;
  try {
    var _setHdr = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      try {
        if (String(name).toLowerCase() === 'authorization' && value) token = String(value);
      } catch (e) {}
      return _setHdr.apply(this, arguments);
    };
  } catch (e) { console.error('[豆瓣助手] XHR 钩子失败', e); }
  try {
    var _fetch = unsafeWindow.fetch.bind(unsafeWindow);
    unsafeWindow.fetch = function(input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url.indexOf('/v/api/') !== -1) {
          var h = (init && init.headers) || (input && input.headers);
          if (h) {
            var auth = null;
            if (typeof h.get === 'function') auth = h.get('Authorization') || h.get('authorization');
            else auth = h['Authorization'] || h['authorization'] || null;
            if (auth) token = String(auth);
          }
        }
      } catch (e) {}
      return _fetch.apply(null, arguments);
    };
  } catch (e) { console.error('[豆瓣助手] fetch 钩子失败', e); }

  /* --- authx 签名（与 Python 客户端逐字节对拍一致）--- */
  function authx(path, bodyStr) {
    var bh = MD5(bodyStr == null ? '' : bodyStr);
    var nonce = String(100000 + Math.floor(Math.random() * 900000));
    var ts = String(Date.now());
    var sign = MD5([SECRET, path, nonce, ts, bh, API_KEY].join('_'));
    return 'nonce=' + nonce + '&timestamp=' + ts + '&sign=' + sign;
  }

  function trimPost(path, body) {
    var fullPath = '/v/api/v1' + path;
    var bodyStr = JSON.stringify(body);
    if (!token) return Promise.reject(new Error('还没抓到登录凭证：刷新页面等 2 秒再点'));
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 60000) : null;
    return fetch(location.origin + fullPath, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'X-Trim-Client': 'web',
        'X-Trim-Client-Version': '631',
        'authx': authx(fullPath, bodyStr)
      },
      body: bodyStr,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function(r) {
      if (timer) clearTimeout(timer);
      return r.json();
    }, function(e) {
      if (timer) clearTimeout(timer);
      throw (e && e.name === 'AbortError') ? new Error('请求超时（60 秒无响应），稍后再试') : e;
    });
  }

  /* --- 豆瓣预览（GM_xmlhttpRequest 绕过 CORS）--- */
  function doubanPreview(id, cb) {
    if (typeof GM_xmlhttpRequest !== 'function') { cb('GM_xmlhttpRequest 不可用：脚本没在篡改猴里运行？'); return; }
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://m.douban.com/rexxar/api/v2/movie/' + id,
      headers: { 'Referer': 'https://m.douban.com/', 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36' },
      timeout: 15000,
      onload: function(res) { try { cb(null, JSON.parse(res.responseText)); } catch (e) { cb('解析失败: ' + e.message); } },
      onerror: function() { cb('网络错误（豆瓣可能拦截，稍后重试）'); },
      ontimeout: function() { cb('超时'); }
    });
  }

  function parseDoubanId(s) {
    s = String(s || '').trim();
    if (/^\d+$/.test(s)) return s;
    var m = s.match(/subject\/(\d+)/);
    return m ? m[1] : null;
  }

  function parseGuid(s) {
    s = String(s || '').trim();
    if (/^[0-9a-f]{32}$/i.test(s)) return s;
    var m = String(location.pathname).match(/[0-9a-f]{32}/i);
    return m ? m[0] : null;
  }

  /* ========= 3. NFO 库直写降级：豆瓣数据 → saveEditDetail ========= */
  var lastDouban = null, lastDoubanId = null, lastCelebs = null;

  function getEditDetail(guid) {
    return trimPost('/item/getEditDetail', { item_guid: guid }).then(function(r) {
      if (!r || r.code !== 0 || !r.data) throw new Error('读取条目详情失败: ' + JSON.stringify(r).slice(0, 80));
      return r.data;
    });
  }

  function fetchCelebs(id, cb) {
    if (typeof GM_xmlhttpRequest !== 'function') { cb(null); return; }
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://m.douban.com/rexxar/api/v2/movie/' + id + '/celebrities',
      headers: { 'Referer': 'https://m.douban.com/', 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36' },
      timeout: 15000,
      onload: function(res) { try { cb(JSON.parse(res.responseText)); } catch (e) { cb(null); } },
      onerror: function() { cb(null); },
      ontimeout: function() { cb(null); }
    });
  }

  function cleanRole(ch) {
    ch = String(ch || '').trim().replace(/^饰[:：]?\s*/, '').replace(/[（(][^（()）]*[)）]\s*$/, '').trim();
    return /^(演员|导演|配音|出演|饰演)$/.test(ch) ? '' : ch;
  }

  function personGuid(name, cache) {
    if (cache[name]) return Promise.resolve(cache[name]);
    return trimPost('/person/search', { keyword: name }).then(function(r) {
      var d = (r && r.data) || {};
      var lst = d.list || (Array.isArray(d) ? d : []);
      for (var i = 0; i < lst.length; i++) {
        if (lst[i] && lst[i].name === name && lst[i].guid) { cache[name] = lst[i].guid; return lst[i].guid; }
      }
      return trimPost('/person/create', { name: name }).then(function(r2) {
        if (r2 && r2.code === 0 && r2.data && r2.data.guid) { cache[name] = r2.data.guid; return r2.data.guid; }
        return null;
      });
    }).catch(function() { return null; });
  }

  function fetchPosterBlob(url) {
    return new Promise(function(res, rej) {
      if (typeof GM_xmlhttpRequest !== 'function') { rej(new Error('GM_xmlhttpRequest 不可用')); return; }
      GM_xmlhttpRequest({
        method: 'GET', url: url, responseType: 'blob', timeout: 20000,
        headers: { 'Referer': 'https://movie.douban.com/', 'User-Agent': 'Mozilla/5.0' },
        onload: function(r) { (r.status >= 200 && r.status < 300 && r.response) ? res(r.response) : rej(new Error('海报下载失败 HTTP ' + r.status)); },
        onerror: function() { rej(new Error('海报下载网络错误')); },
        ontimeout: function() { rej(new Error('海报下载超时')); }
      });
    });
  }

  /* multipart 上传，签名体是 '{}'（与 Python 客户端一致） */
  function uploadPosterBlob(blob) {
    var fd = new FormData();
    var name = (blob.type && blob.type.indexOf('png') >= 0) ? 'poster.png' : 'poster.jpg';
    try { fd.append('file', new File([blob], name, { type: blob.type || 'image/jpeg' })); }
    catch (e) { fd.append('file', blob, name); }
    fd.append('image_type', 'poster');
    var fullPath = '/v/api/v1/image/temp/upload';
    if (!token) return Promise.reject(new Error('还没抓到登录凭证'));
    return fetch(location.origin + fullPath, {
      method: 'POST', credentials: 'include',
      headers: { 'Authorization': token, 'X-Trim-Client': 'web', 'X-Trim-Client-Version': '631', 'authx': authx(fullPath, '{}') },
      body: fd
    }).then(function(r) { return r.json(); }).then(function(r) {
      if (!r || r.code !== 0 || !(r.data && r.data.hash_path)) throw new Error('海报上传失败: ' + JSON.stringify(r).slice(0, 80));
      return r.data.hash_path;
    });
  }

  /* 只填空缺字段，不覆盖已有资料；返回写入字段名列表 */
  function directWrite(guid, id) {
    return getEditDetail(guid).then(function(d) {
      if (lastDouban && lastDoubanId === id) return apply(d, lastDouban);
      return new Promise(function(res) { doubanPreview(id, function(err, dd) { res(err ? null : dd); }); })
        .then(function(dd) { return apply(d, dd); });
    });

    function apply(d, src) {
      if (!src) throw new Error('豆瓣数据不可用，无法直写');
      var written = [];
      var jobs = [];

      if (!d.posters && src.cover_url) {
        jobs.push(
          fetchPosterBlob(src.cover_url)
            .then(uploadPosterBlob)
            .then(function(hp) { d.posters = hp; d.posters_locked = true; written.push('海报'); })
            .catch(function(e) { console.warn('[豆瓣助手] 海报跳过:', e && e.message); })
        );
      }
      if (!d.overview && src.intro) { d.overview = src.intro; d.overview_locked = true; written.push('简介'); }
      var y = String(src.year || '');
      if (/^\d{4}$/.test(y)) {
        if (!d.air_date) { d.air_date = y + '-01-01'; d.air_date_locked = true; written.push('年份'); }
        if (d.first_air_date == null || d.first_air_date === '') { d.first_air_date = y + '-01-01'; d.first_air_date_locked = true; }
      }
      var rv = src.rating && Number(src.rating.value);
      if (rv > 0 && !Number(d.rating)) { d.rating = rv; d.rating_locked = true; written.push('评分'); }

      if ((!d.credits || !d.credits.length) && lastDoubanId === id && lastCelebs) {
        var celebs = [];
        (lastCelebs.directors || []).forEach(function(x) { if (x && x.name) celebs.push({ name: x.name, job: 'Director', character: '' }); });
        (lastCelebs.actors || []).forEach(function(x) { if (x && x.name) celebs.push({ name: x.name, job: 'Actor', character: cleanRole(x.character) }); });
        var cache = {};
        d.credits = d.credits || [];
        jobs.push(celebs.reduce(function(p, ce) {
          return p.then(function() {
            return personGuid(ce.name, cache).then(function(pg) {
              if (!pg) return;
              d.credits.push({ person_guid: pg, name: ce.name, job: ce.job, role: ce.job === 'Actor' ? ce.character : '', order: d.credits.length, profile_path: '' });
            });
          });
        }, Promise.resolve()).then(function() {
          if (d.credits.length) { d.credits_locked = true; written.push('演职员'); }
        }));
      }

      return Promise.all(jobs).then(function() {
        if (!written.length) return written;
        return trimPost('/item/saveEditDetail', d).then(function(r) {
          if (!r || r.code !== 0) throw new Error('写入条目失败: ' + ((r && r.msg) || JSON.stringify(r).slice(0, 80)));
          return written;
        });
      });
    }
  }

  function trimGet(path) {
    var fullPath = '/v/api/v1' + path;
    if (!token) return Promise.reject(new Error('还没抓到登录凭证：刷新页面等 2 秒再点'));
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 60000) : null;
    return fetch(location.origin + fullPath, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Authorization': token,
        'X-Trim-Client': 'web',
        'X-Trim-Client-Version': '631',
        'authx': authx(fullPath, '')
      },
      signal: ctrl ? ctrl.signal : undefined
    }).then(function(r) {
      if (timer) clearTimeout(timer);
      return r.json();
    }, function(e) {
      if (timer) clearTimeout(timer);
      throw (e && e.name === 'AbortError') ? new Error('请求超时（60 秒无响应）') : e;
    });
  }

  /* 从文件名解析集号：SxxExx / 第N集(话/期/回) / EPxx / Exx / 独立数字兜底
     兜底为何取“最后一个”而不是第一个：剧名里常带数字（乡村爱情S16 01 4K → 16 属剧名/部数，01 才是集号）。
     取第一个会把「乡村爱情S16 01」全解析成第16集，41 个文件一起撞号。 */
  var EP_NOISE = { '480': 1, '540': 1, '576': 1, '720': 1, '1080': 1, '1440': 1, '2160': 1, '4320': 1 };
  function parseEpFromFilename(fn) {
    var base = String(fn || '').replace(/\.[A-Za-z0-9]+$/, '');
    var m;
    if ((m = base.match(/[Ss]\d{1,2}\s*[Ee][Pp]?(\d{1,4})(?!\d)/))) return parseInt(m[1], 10);
    if ((m = base.match(/第\s*(\d{1,4})\s*[集话期回]/))) return parseInt(m[1], 10);
    if ((m = base.match(/(?:^|[^\dA-Za-z])[Ee][Pp](\d{1,4})(?!\d)/))) return parseInt(m[1], 10);
    if ((m = base.match(/(?:^|[^\dA-Za-z])[Ee](\d{1,4})(?!\d)/))) return parseInt(m[1], 10);
    /* 兜底：收集所有“前后不是字母数字”的独立数字块，多候选时剔掉干扰项，取最后一个 */
    var re = /(^|[^\dA-Za-z])(\d{1,4})(?![\dA-Za-z])/g, t, all = [];
    while ((t = re.exec(base)) !== null) {
      var v = parseInt(t[2], 10);
      if (v > 0) all.push({ v: v, at: t.index + t[1].length });
    }
    if (!all.length) return 0;
    var pool = all;
    if (all.length > 1) {
      pool = all.filter(function(c) {
        if (EP_NOISE[c.v]) return false;                                          // 1080/2160 等分辨率
        if (c.v >= 1900 && c.v <= 2099 && String(c.v).length === 4) return false;  // 年份
        if (/[SX]/i.test(base.charAt(c.at - 1)) && String(c.v).length <= 2) return false; // S16 / X2 标记
        return true;
      });
    }
    if (!pool.length) return 0;
    return pool[pool.length - 1].v;
  }

  /* 文件名自然排序：让 "02" 排在 "10" 前面 */
  function sortByFilename(a, b) {
    var x = String(a.filename || ''), y = String(b.filename || '');
    try { return x.localeCompare(y, 'zh-Hans-CN', { numeric: true }); }
    catch (e) { return x < y ? -1 : (x > y ? 1 : 0); }
  }

  /* 批量集号修复：目标（季/目录/TV）下的所有文件按文件名解析集号，提交 /scrap/rescrap/batch
     seqMode=true：忽略文件名数字，按文件名自然排序依次编 1..N（剧名带数字时最稳） */
  function fixEpisodes(guid, sn, btn, seqMode) {    btn.disabled = true;
    btn.textContent = '读取详情…';
    var trimId = '';

    /* 递归取媒体文件：目标可能是剧集总节点（子条目是季）也可能是季节点（子条目是集），最多下钻 2 层 */
    function listFiles(parentGuid, depth) {
      return trimPost('/item/list', { parent_guid: parentGuid, page: 1, page_size: 300 }).then(function(r) {
        var items = ((r && r.data) || {}).list || [];
        if (!items.length) return [];
        return Promise.all(items.map(function(it) {
          return trimGet('/media/itemfile/' + it.guid).catch(function() { return null; });
        })).then(function(results) {
          var files = [];
          results.forEach(function(fr) {
            var arr = fr && fr.data;
            (Array.isArray(arr) ? arr : []).forEach(function(f) {
              if (f && f.media_guid) files.push({ media_guid: f.media_guid, filename: f.filename || '' });
            });
          });
          if (files.length || depth <= 0) return files;
          btn.textContent = '展开子目录…';
          return Promise.all(items.map(function(it) { return listFiles(it.guid, depth - 1); })).then(function(groups) {
            var nonEmpty = groups.filter(function(g) { return g && g.length; });
            /* 多个子条目各自带文件 = 多季或多个剧集，集号混编会互相覆盖，直接劝退 */
            if (nonEmpty.length > 1) {
              throw new Error('目标下有 ' + nonEmpty.length + ' 个各自带文件的子条目（多季或多个剧集），集号混编会冲突。请先进入要修复的那一季/那个条目页面再点此按钮');
            }
            return nonEmpty.length ? nonEmpty[0] : [];
          });
        });
      });
    }

    function collectFiles() {
      return getEditDetail(guid).catch(function(e) {
        throw new Error('目标条目已重建或已删除（' + String((e && e.message) || e).slice(0, 40) + '）——请刷新页面后重试');
      }).then(function(d) {
        trimId = (d && d.trim_id) || '';
        btn.textContent = '分析文件中…';
        return listFiles(guid, 2);
      }).then(function(files) {
        if (!files.length) throw new Error('没读到任何媒体文件（目标下可能没有 strm/视频文件）');
        return files;
      });
    }

    function buildPlan(files) {
      var out = [], skipped = 0, dup = {};
      if (seqMode) {
        files.slice().sort(sortByFilename).forEach(function(f, i) { out.push({ f: f, ep: i + 1 }); });
      } else {
        files.forEach(function(f) {
          var ep = parseEpFromFilename(f.filename);
          if (ep > 0) out.push({ f: f, ep: ep }); else skipped++;
        });
      }
      out.forEach(function(p) { dup[p.ep] = (dup[p.ep] || 0) + 1; });
      var dups = Object.keys(dup).filter(function(k) { return dup[k] > 1; })
        .map(function(k) { return parseInt(k, 10); }).sort(function(a, b) { return a - b; });
      return { list: out, skipped: skipped, dups: dups, total: files.length };
    }

    return collectFiles().then(function(files) {
      var p = buildPlan(files);

      /* 撞号：说明文件名里的数字不是集号，别硬提交；引导改用顺序编号 */
      if (p.dups.length && !seqMode) {
        var go = window.confirm(
          '文件名解析出重复集号（' + p.dups.slice(0, 8).join('、') + (p.dups.length > 8 ? ' …' : '') + '），按解析结果编号会互相覆盖。\n\n' +
          '常见原因是剧名本身带数字（如「乡村爱情S16 01」里的 16）。\n' +
          '是否改为「按文件名顺序编号 1–' + p.total + '」？');
        if (!go) throw new Error('已取消，未提交任何改动');
        btn.disabled = false; btn.textContent = '修复集号（批量）';
        return fixEpisodes(guid, sn, btn, true);
      }
      if (!p.list.length) throw new Error('没从文件名解析出任何集号（文件名不含 数字/第N集/EPxx/SxxExx）——可勾选「按文件名顺序编号」再试');

      var first = p.list[0].ep, last = p.list[p.list.length - 1].ep;
      var sample = p.list.slice(0, 3).map(function(x) {
        return '  ' + (x.f.filename || '(无文件名)') + '  →  第 ' + x.ep + ' 集';
      }).join('\n');
      var msg = '将把 ' + p.list.length + ' 个文件编入【第 ' + sn + ' 季' + (sn === 0 ? '（特别篇）' : '') + '】\n' +
        '集号范围：' + first + ' – ' + last + '\n' +
        (p.skipped ? '跳过 ' + p.skipped + ' 个（解析不出集号）\n' : '') +
        (seqMode ? '编号方式：按文件名顺序（忽略文件名里的数字）\n' : '编号方式：按文件名解析出的数字\n') +
        '示例：\n' + sample + '\n\n确认提交？';
      if (!window.confirm(msg)) throw new Error('已取消，未提交任何改动');

      btn.textContent = '提交编号 ' + p.list.length + ' 条…';
      var media = p.list.map(function(x) {
        return { media_guid: x.f.media_guid, season_number: sn, episode_number: x.ep, source: 'trim_id', source_id: trimId };
      });
      return trimPost('/scrap/rescrap/batch', { media_items: media }).then(function(r) {
        if (!r || r.code !== 0) throw new Error('提交失败: ' + ((r && r.msg) || JSON.stringify(r).slice(0, 120)));
        toast('已提交 ' + media.length + ' 条编号（第' + sn + '季）。服务端会重建媒体记录并归入规范季节点，约 20–40 秒后刷新页面查看', true);
      });
    }).catch(function(e) {
      toast(String((e && e.message) || e), false);
    }).then(function() {
      btn.disabled = false;
      btn.textContent = '修复集号（批量）';
    });
  }

  /* --- 特别篇检查（全库发现）：不管当前在哪个页面，扫全部剧集，找出哪些剧带 季=0集=0 的错挂集 ---
     /item/list 不带 ancestor_guid 即扁平返回全库条目，从中取 TV 逐部下钻计数；
     发现阶段只列剧+计数（快），点开剧名才逐集取 /media/itemfile 文件名预填季/集；
     修正提交 /scrap/rescrap/batch（与修复集号同通道，服务端自动重建季节结构） */
  function scanSpecials(btn, resultBox) {
    var BTN_SP = '特别篇检查（扫全库，找出带特别篇的剧）';
    btn.disabled = true;
    resultBox.style.display = 'none';
    resultBox.innerHTML = '';
    var t0 = Date.now();
    var shows = [];    // 命中剧：{ guid, title, hits:[集guid], _rows:展开后取到的文件行 }
    var scanned = 0;
    function prog(msg) { btn.textContent = msg; }
    function restore() { btn.disabled = false; btn.textContent = BTN_SP; }

    function listAll(extra, maxPages) {
      var out = [], page = 1;
      function one() {
        var b = {}, k;
        for (k in extra) b[k] = extra[k];
        b.page = page; b.page_size = 300;
        return trimPost('/item/list', b).then(function(r) {
          var lst = ((r && r.data) || {}).list || [];
          out = out.concat(lst);
          if (lst.length >= 300 && page < (maxPages || 50)) { page++; return one(); }
          return out;
        });
      }
      return one();
    }
    function listChildren(parentGuid) { return listAll({ parent_guid: parentGuid }, 20); }
    function isSpecial(it) {
      return String(it.type || '').toLowerCase() === 'episode' && !Number(it.season_number) && !Number(it.episode_number);
    }

    function countShow(tv) {
      return listChildren(tv.guid).then(function(kids) {
        scanned++;
        prog('扫描中 第' + scanned + '部：' + (tv.title || '(无题)') + '，已发现 ' + shows.length + ' 部');
        var hits = [];
        var chain = Promise.resolve();
        kids.forEach(function(k) {
          var t = String(k.type || '').toLowerCase();
          if (isSpecial(k)) hits.push(k.guid);
          else if (t === 'season') {
            chain = chain.then(function() {
              return listChildren(k.guid).then(function(eps) {
                eps.forEach(function(e) { if (isSpecial(e)) hits.push(e.guid); });
              });
            });
          }
        });
        return chain.then(function() {
          if (hits.length) shows.push({ guid: tv.guid, title: tv.title || '(无题)', hits: hits, _rows: null });
        });
      });
    }

    function renderResults() {
      var total = 0;
      shows.forEach(function(s) { total += s.hits.length; });
      var html = '<div style="color:#a8b3c7;font-size:11px;margin-bottom:4px">全库 ' + scanned + ' 部剧扫完：<b>' + shows.length + '</b> 部带特别篇，共 <b>' + total + '</b> 条错挂集。点开剧名核对修正：</div>';
      shows.forEach(function(s, si) {
        html += '<div class="dh-sp-show" data-si="' + si + '" style="margin:4px 0;border:1px solid #2a3142;border-radius:6px;overflow:hidden">' +
          '<div class="dh-sp-head" style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 8px;background:#1b2130;cursor:pointer">' +
          '<span style="color:#e0c48a;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.title) + '</span>' +
          '<span class="dh-sp-count" style="color:#8a93a6;font-size:10px;flex-shrink:0">' + s.hits.length + ' 条 ▸</span></div>' +
          '<div class="dh-sp-body" style="display:none;padding:6px 8px"></div></div>';
      });
      resultBox.innerHTML = html;
      resultBox.style.display = 'block';
      Array.prototype.forEach.call(resultBox.querySelectorAll('.dh-sp-head'), function(head) {
        head.addEventListener('click', function() { toggleShow(head.parentNode); });
      });
    }

    function toggleShow(root) {
      var s = shows[parseInt(root.getAttribute('data-si'), 10)];
      var body = root.querySelector('.dh-sp-body');
      var cnt = root.querySelector('.dh-sp-count');
      if (body.style.display !== 'none') { body.style.display = 'none'; cnt.textContent = s.hits.length + ' 条 ▸'; return; }
      body.style.display = 'block';
      cnt.textContent = s.hits.length + ' 条 ▾';
      if (s._rows) return;   // 已展开过
      cnt.textContent = '读取文件名…';
      var rows = [];
      var chain = Promise.resolve();
      s.hits.forEach(function(eg) {
        chain = chain.then(function() {
          return trimGet('/media/itemfile/' + eg).catch(function() { return null; }).then(function(fr) {
            var arr = (fr && fr.data) || [];
            (Array.isArray(arr) ? arr : []).forEach(function(f) {
              if (f && f.media_guid) rows.push({ media_guid: f.media_guid, filename: f.filename || '' });
            });
          });
        });
      });
      chain.then(function() {
        s._rows = rows;
        if (!rows.length) { body.innerHTML = '<div style="color:#e08a8a;font-size:10px;padding:4px 0">没有取到文件信息</div>'; cnt.textContent = '0 条 ▾'; return; }
        var inner = '';
        rows.forEach(function(r, ri) {
          var ep = parseEpFromFilename(r.filename);
          inner += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">' +
            '<input type="checkbox" class="dh-sp-ck" data-ri="' + ri + '" checked style="flex-shrink:0">' +
            '<span title="' + esc(r.filename) + '" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dde3ee;font-size:10px">' + esc(r.filename || '(无文件名)') + '</span>' +
            '<span style="color:#8a93a6;font-size:10px;flex-shrink:0">季</span><input class="dh-sp-sn" data-ri="' + ri + '" type="number" value="1" min="0" max="99" style="width:42px;box-sizing:border-box;padding:3px;border-radius:4px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:11px">' +
            '<span style="color:#8a93a6;font-size:10px;flex-shrink:0">集</span><input class="dh-sp-ep" data-ri="' + ri + '" type="number" value="' + (ep > 0 ? ep : '') + '" min="1" max="9999" style="width:50px;box-sizing:border-box;padding:3px;border-radius:4px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:11px">' +
            '</div>';
        });
        inner += '<button class="dh-spsubmit" style="width:100%;margin-top:6px;padding:6px;border:0;border-radius:6px;background:#c0392b;color:#fff;font-weight:600;cursor:pointer">提交修正（该剧勾选集）</button>';
        body.innerHTML = inner;
        cnt.textContent = rows.length + ' 条 ▾';
        body.querySelector('.dh-spsubmit').addEventListener('click', function() { submitShow(s, body, this); });
      });
    }

    function submitShow(s, body, btnEl) {
      var rows = s._rows || [];
      var picked = [];
      Array.prototype.forEach.call(body.querySelectorAll('.dh-sp-ck'), function(ck) {
        if (!ck.checked) return;
        var ri = parseInt(ck.getAttribute('data-ri'), 10);
        var row = rows[ri];
        if (!row || !row.media_guid) return;
        var sn = parseInt(body.querySelector('.dh-sp-sn[data-ri="' + ri + '"]').value, 10);
        var ep = parseInt(body.querySelector('.dh-sp-ep[data-ri="' + ri + '"]').value, 10);
        if (!isNaN(sn) && sn >= 0 && !isNaN(ep) && ep >= 1) picked.push({ row: row, sn: sn, ep: ep });
      });
      if (!picked.length) { toast('没有可提交的行：需要勾选且季/集号合法（集 ≥ 1）', false); return; }
      btnEl.disabled = true;
      btnEl.textContent = '提交中…';
      getEditDetail(s.guid).then(function(d) {
        var trimId = (d && d.trim_id) || '';
        var media = picked.map(function(pp) { return { media_guid: pp.row.media_guid, season_number: pp.sn, episode_number: pp.ep, source: 'trim_id', source_id: trimId }; });
        return trimPost('/scrap/rescrap/batch', { media_items: media }).then(function(r) {
          if (!r || r.code !== 0) throw new Error((r && r.msg) || '未知错误');
          toast('【' + s.title + '】' + media.length + ' 条已提交。服务端重建季节结构约 20–40 秒，之后刷新页面查看', true);
          btnEl.textContent = '已提交 ✓';
        });
      }).catch(function(e) {
        toast('提交失败：' + String((e && e.message) || e).slice(0, 60), false);
        btnEl.disabled = false;
        btnEl.textContent = '提交修正（该剧勾选集）';
      });
    }

    prog('扫描中…');
    listAll({}, 50).then(function(flat) {
      var tvs = [], seen = {};
      flat.forEach(function(it) {
        if (String(it.type || '').toLowerCase() === 'tv' && it.guid && !seen[it.guid]) { seen[it.guid] = 1; tvs.push(it); }
      });
      if (!tvs.length) throw new Error('全库没扫到剧集条目');
      var chain = Promise.resolve();
      tvs.forEach(function(tv) { chain = chain.then(function() { return countShow(tv); }); });
      return chain;
    }).then(function() {
      restore();
      var secs = Math.round((Date.now() - t0) / 1000);
      if (!shows.length) { toast('扫完了：全库 ' + scanned + ' 部剧都没有 季=0集=0 的特别篇（' + secs + ' 秒）', true); return; }
      renderResults();
      var total = 0;
      shows.forEach(function(s) { total += s.hits.length; });
      toast('扫完：' + shows.length + ' 部剧带特别篇，共 ' + total + ' 条（' + secs + ' 秒）。点开剧名逐条修正', true);
    }).catch(function(e) {
      toast('扫描失败：' + String((e && e.message) || e).slice(0, 80), false);
      restore();
    });
  }

  /* --- trimmedia-ext 旁路容器通信（标题排序修复等，详见 README 第 8 章）--- */
  var EXT_BASE_KEY = 'fntv_ext_base';
  var PANEL_POS_KEY = 'fntv_panel_pos';   // 面板位置记忆
  var PANEL_W_KEY = 'fntv_panel_width';   // 面板宽度记忆
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function extBase() {
    var saved = (typeof GM_getValue === 'function') ? (GM_getValue(EXT_BASE_KEY) || '') : '';
    if (saved) return saved.replace(/\/+$/, '');
    var port = parseInt(location.port, 10);
    var isIpHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(location.hostname) || location.hostname === 'localhost';
    if (isIpHost && port) return location.protocol + '//' + location.hostname + ':' + (port + 1);
    return location.origin + '/fntv-ext';
  }
  function extReq(method, path, body) {
    return new Promise(function(resolve, reject) {
      var base = extBase();
      if (!base) { reject(new Error('无法推算扩展服务地址，请在下方输入框手动填写')); return; }
      if (!token) { reject(new Error('还没抓到登录凭证：刷新页面等 2 秒再点')); return; }
      if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('GM_xmlhttpRequest 不可用：脚本没在篡改猴里运行？')); return; }
      GM_xmlhttpRequest({
        method: method,
        url: base + path,
        data: body ? JSON.stringify(body) : undefined,
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        timeout: 15000,
        onload: function(res) {
          try {
            var r = JSON.parse(res.responseText);
          } catch (e) { reject(new Error('返回不是 JSON（端口对吗？）：' + String(res.responseText || '').slice(0, 80))); return; }
          if (res.status === 200 && r.ok) resolve(r.data || r);
          else reject(new Error(r.error || ('HTTP ' + res.status + ' ' + String(res.responseText || '').slice(0, 80))));
        },
        onerror: function() { reject(new Error('连不上扩展服务 ' + base + '（容器起了吗？端口对吗？）')); },
        ontimeout: function() { reject(new Error('扩展服务 15 秒无响应')); }
      });
    });
  }

  /* --- UI --- */
  function toast(msg, ok) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:999999;' +
      'max-width:70%;padding:10px 18px;border-radius:8px;color:#fff;font-size:13px;line-height:1.5;' +
      'background:' + (ok === false ? '#c0392b' : (ok === true ? '#27ae60' : '#333')) + ';box-shadow:0 4px 14px rgba(0,0,0,.35)';
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, ok === false ? 6000 : 3500);
  }

  function removePanel() {
    var old = document.getElementById('douban-helper-box');
    if (old) old.remove();
  }

  /* 识别当前路径：/v/<任意层级>/<guid>，如 /v/folder/<guid>、/v/tv/season/<guid>（季页是两段路径） */
  function pathInfo() {
    var path = String(location.pathname);
    var m = path.match(/^\/v\/(.+?)\/([0-9a-f]{32})/i);
    if (!m) return { kind: null, guid: null };
    var kind = m[1].toLowerCase().split('/').pop();  // 'tv/season' → 'season'
    return { kind: kind, guid: m[2] };
  }

  function buildPanel() {
    removePanel();
    if (!document.body || location.pathname.indexOf('/v/') !== 0) return;
    var p = pathInfo();
    var isFolder = p.kind === 'folder';

    var box = document.createElement('div');
    box.id = 'douban-helper-box';
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:999998;background:#1f2430;color:#dde3ee;' +
      'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);font-size:13px;width:300px;overflow:hidden;' +
      'font-family:system-ui,-apple-system,sans-serif';
    var headHtml =
      '<div id="dh-head" style="padding:9px 12px;background:#2a3142;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
      '  <b>豆瓣匹配助手' + (isFolder ? '（目录模式）' : '') + '</b><span id="dh-arrow" style="color:#8a93a6">▾</span></div>';
    var guidHint = isFolder
      ? '目标 guid 已预填为当前目录（整目录识别为该剧）；也可从下方列表选其他条目'
      : '目标条目 guid（打开条目详情页自动带出）';
    function tabStyle(active) {
      return 'flex:1;text-align:center;padding:6px 0;border-radius:6px;font-size:12px;cursor:pointer;' +
        (active ? 'background:#3b82f6;color:#fff;font-weight:600' : 'background:#2a3142;color:#8a93a6');
    }
    var bodyHtml =
      '<div id="dh-body" style="padding:10px 12px;display:none">' +
      '  <div id="dh-tabs" style="display:flex;gap:6px;margin-bottom:9px">' +
      '    <div id="dh-tab-match" style="' + tabStyle(true) + '">豆瓣匹配</div>' +
      '    <div id="dh-tab-edit" style="' + tabStyle(false) + '">手动改值</div>' +
      '  </div>' +
      '  <div id="dh-pagematch">' +
      '  <div style="display:flex;align-items:center;gap:6px;margin:0 0 8px;color:#8a93a6;font-size:11px"><span>豆瓣匹配</span><span style="flex:1;height:1px;background:#2a3142"></span></div>' +
      '  <div style="color:#8a93a6;margin-bottom:6px">' + guidHint + '</div>' +
      '  <input id="dh-guid" placeholder="自动识别，也可手动粘贴" style="width:100%;box-sizing:border-box;height:28px;padding:0 8px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      (isFolder
        ? '  <button id="dh-fbtn" style="width:100%;margin-top:8px;height:28px;border:1px solid #3a4256;border-radius:6px;background:transparent;color:#dde3ee;cursor:pointer;font-size:12px">重新读取本目录条目</button>' +
          '  <div id="dh-flist" style="margin-top:6px;max-height:180px;overflow:auto;display:none"></div>'
        : '') +
      '  <div style="color:#8a93a6;margin:8px 0 6px">豆瓣条目（链接或 ID）</div>' +
      '  <input id="dh-dbid" placeholder="如 movie.douban.com/subject/27125544/ 或纯数字 ID" style="width:100%;box-sizing:border-box;height:28px;padding:0 8px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      '  <div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
      '    <select id="dh-type" style="flex:1;height:28px;padding:0 6px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      '      <option value="TV">电视剧</option><option value="MOVIE">电影</option></select>' +
      '    <button id="dh-preview" style="flex:1;height:28px;border:1px solid #3a4256;border-radius:6px;background:transparent;color:#dde3ee;cursor:pointer;font-size:12px">预览豆瓣</button>' +
      '  </div>' +
      '  <div id="dh-info" style="margin-top:8px;font-size:12px;color:#a8b3c7;max-height:130px;overflow:auto;display:none"></div>' +
      '  <button id="dh-go" style="width:100%;margin-top:10px;height:32px;border:0;border-radius:6px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;font-size:13px">开始豆瓣匹配</button>' +
      '  <div style="display:flex;align-items:center;gap:6px;margin:14px 0 8px;color:#8a93a6;font-size:11px"><span>集号修复</span><span style="flex:1;height:1px;background:#2a3142"></span></div>' +
      '  <div style="display:flex;gap:8px;align-items:center">' +
      '    <span style="color:#8a93a6;font-size:12px;flex-shrink:0">季号</span>' +
      '    <input id="dh-season" type="number" value="1" min="0" max="99" style="width:56px;box-sizing:border-box;height:28px;padding:0 6px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      '    <button id="dh-fixnum" style="flex:1;height:28px;border:0;border-radius:6px;background:#16a085;color:#fff;cursor:pointer;font-size:12px">修复集号（批量）</button>' +
      '  </div>' +
      '  <label style="display:flex;align-items:flex-start;gap:6px;margin-top:8px;color:#8a93a6;font-size:11px;line-height:1.4;cursor:pointer">' +
      '    <input id="dh-seq" type="checkbox" style="margin:2px 0 0">' +
      '    <span>按文件名顺序编号（忽略文件名里的数字）；剧名带数字时更稳，如「乡村爱情S16 01」</span></label>' +
      '  <button id="dh-spcheck" style="width:100%;margin-top:10px;height:28px;border:1px solid #a04e2a;border-radius:6px;background:transparent;color:#e8955a;cursor:pointer;font-size:12px">特别篇检查（扫全库，找出带特别篇的剧）</button>' +
      '  <div id="dh-spresult" style="display:none;margin-top:8px;max-height:300px;overflow:auto;border:1px solid #3a4256;border-radius:6px;padding:6px"></div>' +
      '  <div style="margin-top:10px;color:#66708a;font-size:11px;line-height:1.5">普通库：匹配=重建条目，收藏/播放记录可能丢失。本地 NFO 库（如微短剧2025）：服务端忽略在线匹配，脚本等 45 秒后自动改为直接写入豆瓣数据（海报/简介/年份/评分/演职员，只填空缺不覆盖已有）。</div>' +
      '  </div>' +
      '  <div id="dh-pageedit" style="display:none">' +
      '    <div style="color:#8a93a6;margin-bottom:6px">手动修改条目的 title / sort_title / air_date 字段<br><span style="color:#66708a;font-size:10px">需 trimmedia-ext 容器；在条目详情页打开本面板自动带出当前值</span></div>' +
      '    <input id="dh-extbase" placeholder="扩展服务地址：留空=自动（IP访问端口+1；域名访问走 /fntv-ext）" style="width:100%;box-sizing:border-box;height:28px;padding:0 8px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      '    <div id="dh-editinfo" style="color:#a8b3c7;font-size:12px;line-height:1.6">正在读取当前条目…</div>' +
      '    <div id="dh-editform" style="display:none">' +
      '      <div style="color:#8a93a6;margin:8px 0 4px;font-size:11px">标题</div>' +
      '      <input id="dh-etitle" style="width:100%;box-sizing:border-box;height:28px;padding:0 8px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      '      <div style="color:#8a93a6;margin:8px 0 4px;font-size:11px">sort_title（官方「标题」排序实际读这个字段）</div>' +
      '      <input id="dh-esort" placeholder="须为：相同前缀 + 补零两位数字，如 权力的游戏02" style="width:100%;box-sizing:border-box;height:28px;padding:0 8px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      '      <div style="color:#66708a;margin-top:3px;font-size:10px;line-height:1.5">排序按此字段的字典序：数字必须补零（01、02…），写成 1、2、10 会排成 1,10,2；中文数字（第一、第二季）按码点排序必然乱。</div>' +
      '      <div style="color:#8a93a6;margin:8px 0 4px;font-size:11px">发行时间（YYYY-MM-DD，清空输入框=清空该值）</div>' +
      '      <input id="dh-edate" placeholder="YYYY-MM-DD" style="width:100%;box-sizing:border-box;height:28px;padding:0 8px;border-radius:6px;border:1px solid #3a4256;background:#171b24;color:#dde3ee;font-size:12px">' +
      '      <div style="margin-top:10px;padding:7px 9px;border-radius:6px;background:#3a2626;border:1px solid #7a3b34;color:#e8a79e;font-size:11px;line-height:1.6">本操作直接写入媒体数据库：请核对修改值后再保存；每次保存前会自动备份数据库，可通过 ext 的 /api/backups/restore 接口恢复。<br>保存后如界面未显示新值，请重启 trimmedia 容器刷新服务端缓存。</div>' +
      '      <button id="dh-esave" style="display:none;width:100%;margin-top:8px;height:32px;border:1px solid #7a3b34;border-radius:6px;background:#c0392b;color:#fff;font-weight:600;cursor:pointer;font-size:13px">保存修改（一键写库，自动备份）</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    box.innerHTML = headHtml + bodyHtml;
    document.body.appendChild(box);

    /* --- tab 切换 --- */
    var pageMatch = box.querySelector('#dh-pagematch'), pageEdit = box.querySelector('#dh-pageedit');
    var tabMatch = box.querySelector('#dh-tab-match'), tabEdit = box.querySelector('#dh-tab-edit');
    function switchTab(name) {
      var map = { match: [pageMatch, tabMatch], edit: [pageEdit, tabEdit] };
      Object.keys(map).forEach(function(k) {
        map[k][0].style.display = (k === name) ? 'block' : 'none';
        map[k][1].style.cssText = tabStyle(k === name);
      });
      if (name === 'edit') loadEdit();
    }
    tabMatch.addEventListener('click', function() { switchTab('match'); });
    tabEdit.addEventListener('click', function() { switchTab('edit'); });

    /* --- 扩展服务地址（手动改值 tab 里设置，GM 记忆） --- */
    var extBaseInput = box.querySelector('#dh-extbase');
    extBaseInput.value = (typeof GM_getValue === 'function') ? (GM_getValue(EXT_BASE_KEY) || '') : '';
    extBaseInput.addEventListener('change', function() {
      var v = extBaseInput.value.trim().replace(/\/+$/, '');
      if (typeof GM_setValue === 'function') GM_setValue(EXT_BASE_KEY, v);
      toast(v ? '扩展服务地址已保存：' + v : '已清除，恢复自动寻址（IP端口+1 / 域名 /fntv-ext）', true);
    });

    /* --- 手动改值：读取当前条目 → 直接改 title/sort_title/air_date → 一键写库（自动备份） --- */
    var editItem = null;   // 当前条目快照（来自 ext /api/item/preview）
    function loadEdit() {
      var info = box.querySelector('#dh-editinfo'), form = box.querySelector('#dh-editform');
      var saveBtn = box.querySelector('#dh-esave');
      editItem = null;
      form.style.display = 'none'; saveBtn.style.display = 'none';
      if (!p.guid) {
        info.innerHTML = '<span style="color:#e67e22">请先打开某个条目的详情页（如剧集/电影/季的页面），再回来读取</span>';
        return;
      }
      info.textContent = '正在读取当前条目…';
      extReq('GET', '/api/item/preview?guid=' + encodeURIComponent(p.guid))
        .then(function(data) {
          editItem = data.item || data;
          if (editItem.type === 'MediaDB' || editItem.type === 'Directory') {
            info.innerHTML = '<span style="color:#e67e22">⚠ 当前 guid 是' +
              (editItem.type === 'MediaDB' ? '媒体库' : '目录') + '节点（' + esc(editItem.title) + '），改标题会连库名一起改。' +
              '请到具体的剧/电影/季详情页再操作</span>';
            return;
          }
          info.innerHTML = '当前条目：<b>' + esc(editItem.title) + '</b>（' + esc(editItem.type || '?') + '）';
          form.style.display = 'block';
          saveBtn.style.display = 'block';
          box.querySelector('#dh-etitle').value = editItem.title || '';
          box.querySelector('#dh-esort').value = editItem.sort_title || '';
          box.querySelector('#dh-edate').value = editItem.air_date || editItem.first_air_date || '';
        })
        .catch(function(e) {
          info.innerHTML = '<span style="color:#e67e22">读取失败：' + esc(e.message) +
            '（ext 服务没通？检查上方「扩展服务地址」）</span>';
        });
    }
    box.querySelector('#dh-esave').addEventListener('click', function() {
      if (!editItem) return;
      var saveBtn = box.querySelector('#dh-esave'), info = box.querySelector('#dh-editinfo');
      var newTitle = box.querySelector('#dh-etitle').value.trim();
      var newSort = box.querySelector('#dh-esort').value.trim();
      var newDate = box.querySelector('#dh-edate').value.trim();
      var fields = {};
      if (newTitle && newTitle !== editItem.title) fields.title = newTitle;
      if (newSort !== (editItem.sort_title || '')) fields.sort_title = newSort;
      if (newDate !== (editItem.air_date || '')) fields.air_date = newDate;
      if (newDate !== (editItem.first_air_date || '')) fields.first_air_date = newDate;
      if (!Object.keys(fields).length) {
        info.innerHTML = '<span style="color:#42b983">没有改动，无需保存</span>';
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = '写库中…';
      extReq('POST', '/api/patch/apply', { items: [{ guid: editItem.guid, fields: fields }] })
        .then(function(d) {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存修改（一键写库，自动备份）';
          info.innerHTML = '<span style="color:#42b983">✓ 已写入 ' + d.changed + ' 项：' +
            Object.keys(fields).join(' / ') + '。备份：' + esc(d.backup || '-') +
            '<br>如界面未显示新值，请重启 trimmedia 容器刷新服务端缓存</span>';
          editItem.title = newTitle; editItem.sort_title = newSort;
          editItem.air_date = newDate; editItem.first_air_date = newDate;
        })
        .catch(function(e) {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存修改（一键写库，自动备份）';
          info.innerHTML = '<span style="color:#e67e22">写入失败：' + esc(e.message) + '</span>';
        });
    });

    var head = box.querySelector('#dh-head'), body = box.querySelector('#dh-body'), arrow = box.querySelector('#dh-arrow');

    /* --- 面板几何：位置记忆 + 标题栏拖动 + 右下角调宽 --- */
    function geom() {
      if (typeof GM_getValue !== 'function') return;
      var w = parseInt(GM_getValue(PANEL_W_KEY, ''), 10);
      if (w >= 280 && w <= 700) box.style.width = w + 'px';
      var pos = GM_getValue(PANEL_POS_KEY);
      if (pos && pos.x != null) {
        box.style.left = Math.min(pos.x, Math.max(0, window.innerWidth - 80)) + 'px';
        box.style.top = Math.min(pos.y, Math.max(0, window.innerHeight - 36)) + 'px';
        box.style.right = 'auto';
        box.style.bottom = 'auto';
      }
    }
    geom();
    var dragState = { down: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 };
    head.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      var r = box.getBoundingClientRect();
      dragState = { down: true, moved: false, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragState.down) return;
      var dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
      if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 5) dragState.moved = true;
      if (!dragState.moved) return;
      box.style.left = Math.max(0, Math.min(dragState.ox + dx, window.innerWidth - 80)) + 'px';
      box.style.top = Math.max(0, Math.min(dragState.oy + dy, window.innerHeight - 36)) + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function() {
      if (!dragState.down) return;
      dragState.down = false;
      if (dragState.moved && typeof GM_setValue === 'function') {
        GM_setValue(PANEL_POS_KEY, { x: parseInt(box.style.left, 10), y: parseInt(box.style.top, 10) });
      }
    });
    var grip = document.createElement('div');
    grip.textContent = '◢';
    grip.title = '拖动调整面板宽度';
    grip.style.cssText = 'position:absolute;right:2px;bottom:1px;width:16px;height:16px;color:#5a6275;' +
      'cursor:nwse-resize;font-size:11px;line-height:16px;text-align:center;user-select:none;z-index:2';
    box.appendChild(grip);
    var gripState = { down: false, sw: 0, sx: 0 };
    grip.addEventListener('mousedown', function(e) {
      gripState = { down: true, sw: box.offsetWidth, sx: e.clientX };
      e.preventDefault();
      e.stopPropagation();
    });
    document.addEventListener('mousemove', function(e) {
      if (!gripState.down) return;
      var w = Math.max(280, Math.min(gripState.sw + e.clientX - gripState.sx, Math.floor(window.innerWidth * 0.75), 700));
      box.style.width = w + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!gripState.down) return;
      gripState.down = false;
      if (typeof GM_setValue === 'function') GM_setValue(PANEL_W_KEY, box.offsetWidth);
    });

    head.addEventListener('click', function() {
      if (dragState.moved) { dragState.moved = false; return; }  // 拖动结束的落点不算点击，避免折叠
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      arrow.textContent = open ? '▸' : '▾';
    });

    /* guid 预填：目录页的目录 guid 本身就是合法的 rescrap 目标（整目录匹配），直接预填 */
    var pre = p.guid || '';
    box.querySelector('#dh-guid').value = pre;

    /* --- 目录模式：列出目录下条目，点选作为匹配目标 --- */
    if (isFolder) {
      var listEl = box.querySelector('#dh-flist');
      function pick(it) {
        box.querySelector('#dh-guid').value = it.guid;
        box.querySelector('#dh-guid').style.borderColor = '#42b983';
        if ((it.type || '') === 'Video') {
          toast('注意："' + (it.title || '') + '" 是单集条目；strm/NFO 库的单集无法在线匹配。一般应保留目录 guid 作为目标', false);
        } else {
          toast('目标条目：' + (it.title || it.guid), true);
        }
      }
      function renderList(items) {
        listEl.style.display = 'block';
        listEl.innerHTML = '';
        if (!items.length) { listEl.innerHTML = '<div style="color:#e74c3c;font-size:12px">目录下没有条目</div>'; return; }
        items.forEach(function(it) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;padding:5px 6px;margin-top:4px;background:#171b24;border-radius:6px';
          var label = document.createElement('span');
          label.textContent = (it.title || '(无标题)') + ' · ' + (it.type || '?');
          label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;cursor:pointer';
          label.title = label.textContent;
          label.addEventListener('click', function() { pick(it); });
          function mkBtn(txt, bg, fn) {
            var b = document.createElement('button');
            b.textContent = txt;
            b.style.cssText = 'padding:3px 8px;border:0;border-radius:5px;background:' + bg + ';color:#fff;font-size:11px;cursor:pointer;flex-shrink:0';
            b.addEventListener('click', fn);
            return b;
          }
          if ((it.type || '') === 'Directory') {
            row.appendChild(mkBtn('进入', '#3b82f6', function() { loadFolder(it.guid); }));
          }
          row.appendChild(mkBtn('选它', '#e67e22', function() { pick(it); }));
          row.appendChild(label);
          listEl.appendChild(row);
        });
      }
      function loadFolder(g) {
        listEl.style.display = 'block';
        listEl.innerHTML = '<div style="color:#8a93a6;font-size:12px">读取目录中…</div>';
        trimPost('/item/list', { parent_guid: g, page: 1, page_size: 300 })
          .then(function(r) {
            var d = (r && r.data) || {};
            if (!d.list) throw new Error(r.msg || JSON.stringify(r).slice(0, 80));
            renderList(d.list);
          })
          .catch(function(e) {
            listEl.innerHTML = '<div style="color:#e74c3c;font-size:12px">读取失败: ' + String(e.message || e).slice(0, 80) + '</div>';
          });
      }
      box.querySelector('#dh-fbtn').addEventListener('click', function() { loadFolder(p.guid); });
      /* token 是页面自己发请求时抓到的，等它就绪后自动加载一次 */
      var tries = 0;
      var tm = setInterval(function() {
        tries++;
        if (token) { clearInterval(tm); loadFolder(p.guid); }
        else if (tries > 40) clearInterval(tm);
      }, 250);
    }

    box.querySelector('#dh-preview').addEventListener('click', function() {
      var id = parseDoubanId(box.querySelector('#dh-dbid').value);
      var info = box.querySelector('#dh-info');
      if (!id) { info.style.display = 'block'; info.style.color = '#e74c3c'; info.textContent = '没认出豆瓣 ID，请粘贴 movie.douban.com/subject/数字/ 链接或纯数字'; return; }
      info.style.display = 'block'; info.style.color = '#a8b3c7'; info.textContent = '豆瓣请求中…';
      doubanPreview(id, function(err, d) {
        if (err) { info.style.color = '#e74c3c'; info.textContent = err; return; }
        lastDouban = d; lastDoubanId = id; lastCelebs = null;
        fetchCelebs(id, function(c) { if (c) lastCelebs = c; });
        var r = d.rating || {};
        info.style.color = '#a8b3c7';
        info.innerHTML = '<b style="color:#42b983">' + (d.title || '?') + '</b> (' + (d.year || '?') + ')　豆瓣评分 ' +
          (r.value != null ? r.value : '暂无') + '<br>' +
          (d.episodes_count ? '共 ' + d.episodes_count + ' 集 · ' : '') +
          ((d.genres || []).join(' / ')) + '<br>' +
          ((d.intro || '').slice(0, 80)) + '…';
        info.dataset.ok = '1';
      });
    });

    box.querySelector('#dh-fixnum').addEventListener('click', function() {
      var guid = parseGuid(box.querySelector('#dh-guid').value);
      var sn = parseInt(box.querySelector('#dh-season').value, 10);
      var seq = !!box.querySelector('#dh-seq').checked;
      if (!guid) { toast('没找到条目 guid：请先打开季/目录页，或在目录列表里点"选它"', false); return; }
      if (isNaN(sn) || sn < 0) { toast('季号不合法', false); return; }
      fixEpisodes(guid, sn, box.querySelector('#dh-fixnum'), seq);
    });

    box.querySelector('#dh-spcheck').addEventListener('click', function() {
      scanSpecials(box.querySelector('#dh-spcheck'), box.querySelector('#dh-spresult'));
    });

    box.querySelector('#dh-go').addEventListener('click', function() {
      var guid = parseGuid(box.querySelector('#dh-guid').value);
      var id = parseDoubanId(box.querySelector('#dh-dbid').value);
      var type = box.querySelector('#dh-type').value;
      if (!guid) { toast('没找到条目 guid：请先打开条目详情页，或在目录列表里点"选它"', false); return; }
      if (!id) { toast('请先填豆瓣 ID/链接', false); return; }
      var btn = box.querySelector('#dh-go');
      btn.disabled = true; btn.textContent = '提交中…';

      /* 轮询确认刮削是否真的生效（本地 NFO 库永远等不到 trim_id）。
         条目 404 = 服务端删旧建新（正常库的重建特征），也算成功，但 guid 变了要刷新页面。 */
      function pollMatch(left) {
        if (left <= 0) return Promise.resolve({ ok: false, rebuilt: false });
        return new Promise(function(res) { setTimeout(res, 5000); }).then(function() {
          btn.textContent = '等待刮削…（' + (45 - left * 5) + 's）';
          return trimPost('/item/getEditDetail', { item_guid: guid }).then(function(r) {
            var d = (r && r.data) || {};
            if (d.trim_id === 'dt' + id) return { ok: true, rebuilt: false };
            return pollMatch(left - 1);
          }, function(e) {
            if (/失败|404|not found|-6/i.test(String(e && e.message))) return { ok: true, rebuilt: true };
            return pollMatch(left - 1);
          });
        });
      }

      trimPost('/scrap/rescrap', { item_guid: guid, source_id: 'dt' + id, source: 'trim_id', type: type, media_guids: [] })
        .then(function(r) {
          if (!r || r.code !== 0) {
            throw new Error(r && r.code === -14 ? '任务重复：上一个匹配任务还在跑，等它完成再试' : ('提交失败: ' + ((r && r.msg) || JSON.stringify(r).slice(0, 100))));
          }
          return pollMatch(9);
        })
        .then(function(st) {
          if (st && st.ok) {
            btn.disabled = false; btn.textContent = '开始豆瓣匹配';
            toast(st.rebuilt ? '匹配任务已受理（条目重建中，guid 已变）。约 30 秒后刷新页面看新条目' : '豆瓣匹配成功（dt' + id + '），刷新页面看结果', true);
            return null;
          }
          /* 45 秒 trim_id 仍为空 = 本地 NFO 库（服务端忽略在线刮削），降级直写 */
          btn.textContent = '直写豆瓣数据…';
          return directWrite(guid, id).then(function(fields) {
            btn.disabled = false; btn.textContent = '开始豆瓣匹配';
            toast(fields.length
              ? '这是本地 NFO 库，在线匹配被服务端忽略；已把豆瓣数据直接写入：' + fields.join('、')
              : '这是本地 NFO 库，在线匹配被忽略；豆瓣可写字段为空或条目已有数据，未做改动', true);
          });
        })
        .catch(function(e) {
          btn.disabled = false; btn.textContent = '开始豆瓣匹配';
          toast(String((e && e.message) || e), false);
        });
    });
  }

  /* --- SPA 路由监听：飞牛网页是单页应用，切页面不整页刷新，必须自己盯路径变化 --- */
  var currentPath = null;
  function onRoute() {
    if (location.pathname === currentPath) return;
    currentPath = location.pathname;
    buildPanel();
  }
  try {
    var wh = unsafeWindow.history;
    var _push = wh.pushState.bind(wh), _rep = wh.replaceState.bind(wh);
    wh.pushState = function() { var r = _push.apply(null, arguments); setTimeout(onRoute, 0); return r; };
    wh.replaceState = function() { var r = _rep.apply(null, arguments); setTimeout(onRoute, 0); return r; };
    unsafeWindow.addEventListener('popstate', onRoute);
  } catch (e) { console.error('[豆瓣助手] 路由监听失败', e); }
  setInterval(onRoute, 800);
  if (document.body) onRoute();
  else document.addEventListener('DOMContentLoaded', onRoute);
})();
