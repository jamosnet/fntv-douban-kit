#!/bin/sh
# ============================================================
#  飞牛影视（trimmedia）+ OpenList 一键部署
#  适用于：群晖 DSM / fnOS / 任意 Linux（需已装 Docker）
#
#  用法：
#    1. 改下面 4 个变量
#    2. sudo sh deploy.sh
# ============================================================
set -e

# ---------- 需要你改的部分 ----------
BASE=/volume1/docker          # NAS 上放容器的目录（群晖一般是 /volume1/docker）
MEDIA_DIR="$BASE/trimmedia/media"   # 媒体目录（strm 会生成在这里），必须
KEEP_DATA=0                   # 1 = 额外持久化数据库（播放记录/刮削结果），0 = 不挂
DATA_DIR="$BASE/trimmedia/data"     # 仅 KEEP_DATA=1 时使用
OLIST_DIR="$BASE/openlist"          # OpenList 数据

TRIM_PORT=2290                # 飞牛影视对外端口
OLIST_PORT=15827              # OpenList 对外端口
# -----------------------------------

echo "==> 1/6 创建目录"
mkdir -p "$MEDIA_DIR" "$OLIST_DIR"
mkdir -p "$MEDIA_DIR/strm/115" "$MEDIA_DIR/strm/quark"
[ "$KEEP_DATA" = "1" ] && mkdir -p "$DATA_DIR"

echo "==> 2/6 读取当前用户 UID/GID"
UID_NUM=$(id -u)
GID_NUM=$(id -g)
echo "    UID=$UID_NUM GID=$GID_NUM"

echo "==> 3/6 启动飞牛影视容器（端口 $TRIM_PORT）"
DATA_ARG=""
if [ "$KEEP_DATA" = "1" ]; then
  DATA_ARG="-v $DATA_DIR:/vol1/@appdata/trim.media"
  echo "    已启用数据库持久化：$DATA_DIR"
fi
docker rm -f trimmedia 2>/dev/null || true
docker run -d \
  --name trimmedia \
  --restart unless-stopped \
  -e PUID="$UID_NUM" \
  -e GUID="$GID_NUM" \
  -e USER_NAME=admin \
  --device /dev/dri:/dev/dri \
  -v /dev/dri/by-path:/dev/dri/by-path \
  -v "$MEDIA_DIR":/vol1/1000/media \
  $DATA_ARG \
  -p "$TRIM_PORT":8005 \
  ghcr.io/satxm/trimmedia:latest

echo "==> 4/6 启动 OpenList 容器（端口 $OLIST_PORT）"
docker rm -f openlist 2>/dev/null || true
docker run -d \
  --name openlist \
  --restart unless-stopped \
  --user 1001:1001 \
  -v "$OLIST_DIR":/opt/openlist/data \
  -v "$MEDIA_DIR/strm":/strm \
  -p "$OLIST_PORT":5244 \
  -e UMASK=022 \
  openlistteam/openlist:v4.2.10-aio

echo "==> 5/6 修正 strm 目录权限（OpenList 以 1001 写入）"
chown -R 1001:1001 "$MEDIA_DIR/strm" 2>/dev/null || sudo chown -R 1001:1001 "$MEDIA_DIR/strm"
chmod -R 777 "$MEDIA_DIR/strm" 2>/dev/null || sudo chmod -R 777 "$MEDIA_DIR/strm"

echo "==> 6/6 完成"
echo
echo "  飞牛影视： http://<你的NAS_IP>:$TRIM_PORT     账号 admin / 123456"
echo "  OpenList： http://<你的NAS_IP>:$OLIST_PORT   初始密码看日志：docker logs openlist | grep -i password"
echo
echo "  下一步："
echo "   1) 登录 OpenList → 管理 → 存储 → 添加网盘（115 / 夸克）"
echo "   2) 再添加一个 Strm 驱动，本地保存路径填 /strm/115（或 /strm/quark）"
echo "   3) 管理 → 索引 → 手动扫描，等 strm 生成"
echo "   4) 飞牛影视 → 系统设置 → 应用 → 影视 → 允许访问 $MEDIA_DIR"
echo "   5) 飞牛影视新建媒体库，路径选 /vol1/1000/media/strm"
