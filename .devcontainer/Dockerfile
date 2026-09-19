# 開発用コンテナ。ホスト環境（Node、Chromium）への依存を断ち、
# cloneしてコンテナを開けば検証まで完結する状態にするためのもの。
FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# ブラウザはコンテナ内の固定パスに置く。ユーザーのホームに置くと
# ボリュームのマウント有無で消えたり残ったりして再現性が崩れる。
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 日本語のUI・サンプル文書がスクリーンショットで豆腐（□）にならないように。
# Debianベースは日本語フォントを含まない。
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Chromiumはビルド時に焼く。バージョンは package-lock.json の playwright-core に
# 一致させたいので、Featureではなくロックファイルからインストールする。
# package.json と package-lock.json だけを先にコピーして、ソース変更で
# この重いレイヤが無効化されないようにする。
#
# `npx playwright install` ではなく playwright-core のCLIを直接叩く。
# 前者は npm から別パッケージ `playwright` を最新版で取ってきてしまい、
# ロックファイルで固定した版数と食い違う。
COPY package.json package-lock.json /tmp/pw/
RUN cd /tmp/pw \
    && npm ci --ignore-scripts --no-audit --no-fund \
    && ./node_modules/.bin/playwright-core install --with-deps chromium \
    && rm -rf /tmp/pw

# ブラウザは非rootの node ユーザーから読める必要がある。
RUN chmod -R a+rX /ms-playwright
