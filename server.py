# -*- coding: utf-8 -*-
"""
trimmedia-ext —— 飞牛影视数据库扩展接口（旁路容器版）

设计原则（与 fntv-douban-kit 一致）：
  - 只暴露白名单能力，绝无任意 SQL 入口
  - 每个写操作都是「预览 → 确认 → 执行」两段式
  - 每次写库前自动在线备份，默认保留最近 10 份
  - 鉴权复用官方登录态：转发调用者的 Authorization 到官方 /user/info，
    仅放行 is_admin=1 的管理员；另支持 X-Ext-Token 静态 token 供命令行调试

环境变量：
  FNTV_DB          sqlite 路径        默认 /data/database/trimmedia.db
  FNTV_PORT        监听端口           默认 80（compose 映射 2291:80）
  FNTV_TRIM_URL    官方影视地址       如 http://192.168.8.138:2290（设了才启用官方 token 校验）
  FNTV_TOKEN       静态调试 token     可选，设了才接受 X-Ext-Token
  FNTV_BACKUP_DIR  备份目录           默认 /data/ext-backups
  FNTV_BACKUP_KEEP 备份保留份数       默认 10

零第三方依赖：http.server + sqlite3 + urllib 全部来自 Python 标准库。
"""
import json
import hashlib
import os
import random
import sqlite3
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

VERSION = '1.2.1'

# ---------------- 配置 ----------------
DB_PATH = os.environ.get('FNTV_DB', '/data/database/trimmedia.db')
PORT = int(os.environ.get('FNTV_PORT', '80'))
TRIM_URL = os.environ.get('FNTV_TRIM_URL', '').rstrip('/')
STATIC_TOKEN = os.environ.get('FNTV_TOKEN', '')
BACKUP_DIR = os.environ.get('FNTV_BACKUP_DIR', '/data/ext-backups')
BACKUP_KEEP = int(os.environ.get('FNTV_BACKUP_KEEP', '10'))

# 官方 web 前端内置的签名常量（公开可见，与 trim_covers.py 一致）
SECRET = 'NDzZTVxnRKP8Z0jXg1VAMonaG8akvh'
API_KEY = '16CCEB3D-AB42-077D-36A1-F355324E4237'

# patch 模块允许修改的字段白名单（覆盖需求 #3 结构修复 / #6 批量补元数据 / #7 豆瓣评分 / #8 手动改值）
PATCH_FIELDS = {
    'title', 'original_title', 'overview', 'status', 'sort_title',
    'first_air_date', 'last_air_date', 'air_date', 'release_date',
    'number_of_seasons', 'number_of_episodes',
    'vote_average', 'vote_count',
}

# item 模块只读返回的字段（给插件「手动改值」做表单预填）
ITEM_FIELDS = ('guid', 'title', 'original_title', 'sort_title', 'type',
               'air_date', 'first_air_date', 'release_date',
               'season_number', 'episode_number',
               'number_of_seasons', 'number_of_episodes')

# 孤儿清理时需要连带删除的子表（全部按 item_guid 外键关联）
ORPHAN_CHILD_TABLES = [
    'item_ancestor', 'item_media', 'item_person', 'item_tag',
    'item_user', 'item_user_favorite', 'item_user_play', 'item_play_config',
]


# ---------------- 工具 ----------------
def md5(s):
    if isinstance(s, str):
        s = s.encode('utf-8')
    return hashlib.md5(s).hexdigest()


def db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA busy_timeout=8000')
    return conn


def one(conn, sql, args=()):
    row = conn.execute(sql, args).fetchone()
    return dict(row) if row else None


def rows(conn, sql, args=()):
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


# ---------------- 备份（在线安全备份 + 保留 N 份） ----------------
def make_backup(tag):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    name = 'trimmedia.db.bak.%s.%s.db' % (tag, time.strftime('%Y%m%d-%H%M%S'))
    dst = os.path.join(BACKUP_DIR, name)
    src = sqlite3.connect(DB_PATH, timeout=15)
    dst_conn = sqlite3.connect(dst)
    with dst_conn:
        src.backup(dst_conn)
    dst_conn.close()
    src.close()
    # 清理过期备份
    baks = sorted(
        (f for f in os.listdir(BACKUP_DIR) if f.startswith('trimmedia.db.bak.')),
        key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f)),
    )
    for old in baks[:-BACKUP_KEEP] if BACKUP_KEEP > 0 else []:
        try:
            os.remove(os.path.join(BACKUP_DIR, old))
        except OSError:
            pass
    return name


# ---------------- 鉴权 ----------------
_auth_cache = {}          # token -> (expire_ts, ok, username)
_auth_lock = threading.Lock()


def _authx_header(path):
    nonce = str(random.randint(100000, 999999))
    ts = str(int(time.time() * 1000))
    sign = md5('_'.join([SECRET, path, nonce, ts, md5(''), API_KEY]))
    return 'nonce=%s&timestamp=%s&sign=%s' % (nonce, ts, sign)


def _verify_trim_token(token):
    """拿调用者的 token 回官方查 /user/info，仅放行管理员"""
    url = TRIM_URL + '/v/api/v1/user/info'
    req = urllib.request.Request(url, method='GET')
    req.add_header('Authorization', token)
    req.add_header('X-Trim-Client', 'web')
    req.add_header('authx', _authx_header('/v/api/v1/user/info'))
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    except Exception as e:
        return False, '', '官方校验请求失败: %s' % str(e)[:80]
    data = d.get('data') or {}
    if d.get('code') != 0 or not data:
        return False, '', 'token 无效或已过期'
    if not data.get('is_admin'):
        return False, data.get('username', ''), '非管理员账号'
    return True, data.get('username', ''), ''


def check_auth(handler):
    """返回 (ok, error_msg)。Authorization 走官方校验，X-Ext-Token 走静态 token"""
    auth = handler.headers.get('Authorization', '').strip()
    ext_tok = handler.headers.get('X-Ext-Token', '').strip()
    if STATIC_TOKEN and ext_tok and ext_tok == STATIC_TOKEN:
        return True, ''
    if auth and TRIM_URL:
        now = time.time()
        with _auth_lock:
            cached = _auth_cache.get(auth)
        if cached and cached[0] > now:
            return cached[1], cached[2]
        ok, username, msg = _verify_trim_token(auth)
        with _auth_lock:
            _auth_cache[auth] = (now + 300, ok, msg)
        return ok, msg
    if auth and not TRIM_URL:
        return False, '服务端未配置 FNTV_TRIM_URL，无法校验官方 token'
    return False, '缺少凭据（Authorization 或 X-Ext-Token）'


# ---------------- 模块：patch 条目字段修正（需求 #3/#6/#7/#8） ----------------
def _patch_diff(conn, payload):
    items = (payload or {}).get('items')
    if not items and (payload or {}).get('guid'):
        items = [{'guid': payload['guid'], 'fields': payload.get('fields', {})}]
    if not items:
        return {'error': '缺少 items 或 guid/fields'}
    diffs = []
    for it in items:
        guid = it.get('guid')
        fields = it.get('fields') or {}
        bad = [k for k in fields if k not in PATCH_FIELDS]
        if bad:
            return {'error': '字段不在白名单: %s' % ','.join(bad)}
        row = one(conn, 'SELECT * FROM item WHERE guid=?', (guid,))
        if not row:
            return {'error': '条目不存在: %s' % guid}
        change = {}
        for k, v in fields.items():
            cur = row.get(k)
            if cur is None:
                cur = ''
            if str(cur) != str(v):
                change[k] = {'from': cur, 'to': v}
        if change:
            diffs.append({'guid': guid, 'title': row.get('title'), 'changes': change})
    return {'items': diffs, 'count': len(diffs)}


def patch_preview(conn, args, payload):
    return _patch_diff(conn, payload)


def patch_apply(conn, args, payload):
    diff = _patch_diff(conn, payload)
    if 'error' in diff:
        return diff
    if not diff['items']:
        return {'ok': True, 'changed': 0, 'msg': '没有需要修改的字段'}
    backup = make_backup('patch')
    cur = conn.cursor()
    for item in diff['items']:
        for field, ch in item['changes'].items():
            cur.execute('UPDATE item SET %s=? WHERE guid=?' % field, (ch['to'], item['guid']))
        cur.execute('UPDATE item SET update_time=? WHERE guid=?',
                    (int(time.time() * 1000), item['guid']))
    conn.commit()
    return {'ok': True, 'changed': len(diff['items']), 'backup': backup, 'items': diff['items']}


# ---------------- 模块：orphans 孤儿条目清理（需求 #2） ----------------
def orphans_preview(conn, args, payload):
    orphans = rows(conn, '''
        SELECT guid, title, type, parent_guid, path
        FROM item
        WHERE parent_guid IS NOT NULL AND parent_guid != ''
          AND parent_guid NOT IN (SELECT guid FROM item)
        ORDER BY title
    ''')
    return {'orphans': orphans, 'count': len(orphans)}


def orphans_apply(conn, args, payload):
    guids = (payload or {}).get('guids') or []
    if not guids:
        return {'error': '缺少 guids（先调 preview 拿清单，再挑要删的）'}
    # 二次校验：只允许删「当前确实是孤儿」的条目
    valid = {r['guid'] for r in orphans_preview(conn, {}, {})['orphans']}
    targets = [g for g in guids if g in valid]
    skipped = [g for g in guids if g not in valid]
    if not targets:
        return {'ok': True, 'deleted': 0, 'msg': '所选 guid 均不再是孤儿', 'skipped': skipped}
    backup = make_backup('orphans')
    cur = conn.cursor()
    qmarks = ','.join('?' * len(targets))
    existing = {r['name'] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    for table in ['item'] + ORPHAN_CHILD_TABLES:
        if table not in existing:
            continue
        col = 'guid' if table == 'item' else 'item_guid'
        cur.execute('DELETE FROM %s WHERE %s IN (%s)' % (table, col, qmarks), targets)
    conn.commit()
    return {'ok': True, 'deleted': len(targets), 'backup': backup, 'skipped': skipped}


# ---------------- 模块：health 库健康检查（只读） ----------------
def health_preview(conn, args, payload):
    stats = {}
    stats['total'] = one(conn, 'SELECT COUNT(*) c FROM item')['c']
    stats['by_type'] = {r['type']: r['c'] for r in rows(
        conn, 'SELECT type, COUNT(*) c FROM item GROUP BY type')}
    stats['no_poster'] = one(conn, "SELECT COUNT(*) c FROM item WHERE posters IS NULL OR posters=''")['c']
    stats['no_air_date'] = one(conn, "SELECT COUNT(*) c FROM item WHERE air_date IS NULL OR air_date=''")['c']
    stats['no_sort_title'] = one(conn, "SELECT COUNT(*) c FROM item WHERE sort_title IS NULL OR sort_title=''")['c']
    stats['orphans'] = one(conn, '''SELECT COUNT(*) c FROM item
        WHERE parent_guid IS NOT NULL AND parent_guid != ''
          AND parent_guid NOT IN (SELECT guid FROM item)''')['c']
    stats['dup_paths'] = rows(conn, '''SELECT path, COUNT(*) c FROM item
        WHERE path IS NOT NULL AND path != ''
        GROUP BY path HAVING c > 1 ORDER BY c DESC LIMIT 50''')
    return {'health': stats}


# ---------------- 模块：item 条目读取（只读，供插件「手动改值」预填表单） ----------------
_item_cols_cache = None


def _item_cols(conn):
    """item 表实际存在的列 ∩ 想要的字段（防御式：不同版本库列可能有出入）"""
    global _item_cols_cache
    if _item_cols_cache is None:
        have = {r['name'] for r in conn.execute('PRAGMA table_info(item)')}
        _item_cols_cache = tuple(c for c in ITEM_FIELDS if c in have)
    return _item_cols_cache


def item_preview(conn, args, payload):
    guid = (args.get('guid') or [''])[0].strip()
    if not guid:
        return {'error': '缺少 guid'}
    row = one(conn, 'SELECT %s FROM item WHERE guid=?' % ', '.join(_item_cols(conn)), (guid,))
    if not row:
        return {'error': '条目不存在: %s' % guid}
    return {'item': row}


MODULES = {
    'patch': {'doc': '条目字段修正：白名单字段 预览→写库（#3结构/#6补元数据/#7豆瓣评分/#8手动改标题与发行时间）',
              'preview': patch_preview, 'apply': patch_apply},
    'item': {'doc': '条目读取（只读）：按 guid 返回标题/发行时间等可编辑字段', 'preview': item_preview, 'apply': None},
    'orphans': {'doc': '孤儿条目清理：parent_guid 悬空的条目检测与删除（#2）',
                'preview': orphans_preview, 'apply': orphans_apply},
    'health': {'doc': '库健康检查：只读统计（无封面/缺日期/孤儿/重复路径）',
               'preview': health_preview, 'apply': None},
}


# ---------------- HTTP 服务 ----------------
class Handler(BaseHTTPRequestHandler):

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return None

    def _dispatch(self, mod, action, args, payload):
        m = MODULES.get(mod)
        if not m:
            return 404, {'ok': False, 'error': '未知模块: %s（可用: %s）' % (mod, ','.join(MODULES))}
        fn = m.get(action)
        if not fn:
            return 404, {'ok': False, 'error': '%s 不支持 %s' % (mod, action)}
        conn = db()
        try:
            data = fn(conn, args, payload)
            if isinstance(data, dict) and data.get('error'):
                return 400, {'ok': False, 'error': data['error']}
            return 200, {'ok': True, 'data': data}
        except sqlite3.OperationalError as e:
            return 503, {'ok': False, 'error': '数据库繁忙/锁定: %s' % e}
        finally:
            conn.close()

    def _route_get(self):
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)

        if path == '/':
            return 200, {'ok': True, 'service': 'trimmedia-ext', 'version': VERSION,
                         'modules': {k: v['doc'] for k, v in MODULES.items()},
                         'hint': 'GET /api/<模块>/preview?参数 | POST /api/<模块>/apply'}
        if path == '/status':
            baks = len([f for f in os.listdir(BACKUP_DIR)
                        if f.startswith('trimmedia.db.bak.')]) if os.path.isdir(BACKUP_DIR) else 0
            return 200, {'ok': True, 'version': VERSION, 'db': DB_PATH,
                         'db_exists': os.path.exists(DB_PATH),
                         'auth_mode': 'official' if TRIM_URL else ('static' if STATIC_TOKEN else 'NONE'),
                         'backups': baks,
                         'modules': {k: v['doc'] for k, v in MODULES.items()}}

        parts = path.strip('/').split('/')
        if len(parts) == 3 and parts[0] == 'api' and parts[2] == 'preview':
            ok, msg = check_auth(self)
            if not ok:
                return 401, {'ok': False, 'error': msg}
            return self._dispatch(parts[1], 'preview', qs, None)
        if len(parts) == 2 and parts[0] == 'api' and parts[1] == 'backups':
            ok, msg = check_auth(self)
            if not ok:
                return 401, {'ok': False, 'error': msg}
            if not os.path.isdir(BACKUP_DIR):
                return 200, {'ok': True, 'data': {'backups': []}}
            baks = sorted((f for f in os.listdir(BACKUP_DIR) if f.startswith('trimmedia.db.bak.')),
                          key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f)), reverse=True)
            return 200, {'ok': True, 'data': {'backups': [
                {'file': f, 'size': os.path.getsize(os.path.join(BACKUP_DIR, f)),
                 'time': time.strftime('%Y-%m-%d %H:%M:%S',
                                       time.localtime(os.path.getmtime(os.path.join(BACKUP_DIR, f))))}
                for f in baks]}}
        return 404, {'ok': False, 'error': 'not found'}

    def _route_post(self):
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)
        payload = self._read_body()
        if payload is None:
            return 400, {'ok': False, 'error': '请求体不是合法 JSON'}

        parts = path.strip('/').split('/')
        if len(parts) == 3 and parts[0] == 'api' and parts[2] == 'apply':
            ok, msg = check_auth(self)
            if not ok:
                return 401, {'ok': False, 'error': msg}
            return self._dispatch(parts[1], 'apply', qs, payload)
        if len(parts) == 3 and parts[0] == 'api' and parts[2] == 'preview':
            ok, msg = check_auth(self)
            if not ok:
                return 401, {'ok': False, 'error': msg}
            return self._dispatch(parts[1], 'preview', qs, payload)
        if path == '/api/backups/restore':
            ok, msg = check_auth(self)
            if not ok:
                return 401, {'ok': False, 'error': msg}
            fname = (payload or {}).get('file', '')
            src = os.path.join(BACKUP_DIR, os.path.basename(fname))  # basename 防目录穿越
            if not fname or not os.path.isfile(src):
                return 400, {'ok': False, 'error': '备份文件不存在'}
            safety = make_backup('before-restore')
            s = sqlite3.connect(src, timeout=15)
            d = sqlite3.connect(DB_PATH, timeout=15)
            with d:
                s.backup(d)
            s.close()
            d.close()
            return 200, {'ok': True, 'data': {'restored': fname, 'safety_backup': safety,
                                              'note': '建议重启 trimmedia 容器以刷新内存缓存'}}
        if len(parts) == 2 and parts[0] == 'api':
            # POST 预览（patch 等带 body 的预览）
            ok, msg = check_auth(self)
            if not ok:
                return 401, {'ok': False, 'error': msg}
            return self._dispatch(parts[1], 'preview', qs, payload)
        return 404, {'ok': False, 'error': 'not found'}

    def do_GET(self):
        try:
            code, obj = self._route_get()
        except Exception as e:
            code, obj = 500, {'ok': False, 'error': str(e)[:200]}
        self._json(code, obj)

    def do_POST(self):
        try:
            code, obj = self._route_post()
        except Exception as e:
            code, obj = 500, {'ok': False, 'error': str(e)[:200]}
        self._json(code, obj)

    def log_message(self, fmt, *args):
        print('[trimmedia-ext] %s' % (fmt % args), flush=True)


if __name__ == '__main__':
    if not os.path.exists(DB_PATH):
        print('[trimmedia-ext] 警告: 数据库不存在 %s' % DB_PATH, flush=True)
    print('[trimmedia-ext] v%s db=%s port=%s auth=%s' %
          (VERSION, DB_PATH, PORT, 'official' if TRIM_URL else ('static' if STATIC_TOKEN else 'NONE')),
          flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
