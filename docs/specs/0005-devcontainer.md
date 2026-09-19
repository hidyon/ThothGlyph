# 0005: devcontainerでの開発に移行する

- 対応issue: [0005](../issues/0005-devcontainer.md)
- 状態: implemented
- 作成日: 2026-09-19

## 目的

「cloneしてコンテナを開けば開発できる」状態にする。今はNode、Chromium、
playwright-coreの3つがホスト環境とセッションのスクラッチパッドに散らばっていて、
環境が変われば再現しない。

とくに重要なのは**受け入れ基準の検証がコンテナ内で完結すること**。仕様駆動開発は
「受け入れ基準を実際に動かして確認する」ことが要なので、検証手段が環境依存だと
進め方の土台が崩れる。CLAUDE.mdにベタ書きされたホストパス
（`/home/hide/.cache/ms-playwright/...`）を消すのがこの仕様のゴールのひとつ。

## 仕様

### 1. コンテナイメージ

`.devcontainer/Dockerfile` を自前で書く。既製のFeatureでPlaywrightを入れる方法も
あるが、ブラウザ版数をplaywrightのバージョンに追随させたいので、`npm ci` の後に
`npx playwright install --with-deps chromium` を走らせる形にする。

- ベースイメージ: `mcr.microsoft.com/devcontainers/typescript-node:22-bookworm`
  - Node 22 を採用する。vite 8 の要求は `^20.19.0 || >=22.12.0` で、ホストの
    20.20.2 も条件を満たすが、20系はメンテナンス期限が近い。移行のついでに上げる。
  - このイメージは非rootの `node` ユーザー、git、npm を含む。
- Chromiumとその依存ライブラリをイメージに焼く。`--with-deps` がDebianの
  必要パッケージ（フォント、libnss3 等）を入れる。
- `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` を設定し、ブラウザをコンテナ内の
  固定パスに置く。**このパスはCLAUDE.mdに書いてよい唯一のブラウザパスになる。**

### 2. `playwright-core` をdevDependencyにする

スクラッチパッドへの手動インストールをやめ、`package.json` の devDependencies に
加える。これでplaywrightのバージョンとブラウザ版数が `package-lock.json` で固定され、
検証スクリプトの再現性がロックファイルに載る。

イメージビルド時の `npx playwright install` もこのバージョンを使うため、
「インストールしたブラウザ版数とライブラリが食い違う」事故が起きなくなる。

検証スクリプトからは `executablePath` の指定が不要になる（playwrightが
`PLAYWRIGHT_BROWSERS_PATH` から自力で見つける）。

### 3. `.devcontainer/devcontainer.json`

- `forwardPorts: [5173]` — Vite開発サーバ。
- Viteはコンテナ内で `--host 0.0.0.0` にバインドしないとホストのブラウザから
  届かない。`vite.config.ts` に `server: { host: true }` を書く
  （コマンドラインではなく設定に書き、`npm run dev` のままで動くようにする）。
- `postCreateCommand: "npm ci"` — 依存はコンテナ作成時に入れる。
- `node_modules` を名前付きボリュームにマウントする。WSLのファイルシステムを
  bindマウント経由で読み書きするとnpmが極端に遅くなるため。
- 非rootの `node` ユーザーで動かす（`remoteUser: "node"`）。
- VSCode拡張: ESLint相当は使っていないので、最小限に留める。

### 4. Claude Codeをコンテナ内で動かす

- Feature `ghcr.io/anthropics/devcontainer-features/claude-code:1` を追加する。
- ホストの認証情報を引き継ぐため、`~/.claude` をコンテナにマウントする。
  認証情報を含むので、この判断は仕様に明記しておく（コンテナはローカル専用、
  イメージを配布しない前提）。

### 5. CLAUDE.mdの更新

「実機検証」節を書き換える。

- ホストパスのベタ書きを削除し、`executablePath` 不要になったことを書く。
- `playwright-core` は devDependency なので「スクラッチパッドに入れる」記述を消す。
- 開発はdevcontainer前提であることを冒頭に書く。

### 対象ファイル

| ファイル | 内容 |
|---|---|
| `.devcontainer/Dockerfile` | 新規。ベースイメージ + Chromium |
| `.devcontainer/devcontainer.json` | 新規。ポート、ボリューム、Feature |
| `vite.config.ts` | `server.host` を追加 |
| `package.json` | `playwright-core` を devDependencies に追加 |
| `CLAUDE.md` | 「実機検証」節の書き換え、devcontainer前提の明記 |
| `README.md` | 起動手順をdevcontainer前提に書き換え |
| `docs/issues/README.md` | 0005をclosedに |

## 受け入れ基準

コンテナを再ビルドして、**コンテナ内で**以下を確認する。

- [ ] `node -v` が v22 系を返す
- [ ] `npm run build` が型エラーなく通る
- [ ] `npm run lint` が終了コード0で通る
- [ ] `npm run dev` を起動し、**ホスト側のブラウザから** http://localhost:5173 が開ける
- [ ] 検証スクリプトが `executablePath` を指定せずにChromiumを起動でき、
      初期文書のKaTeX数式が描画されたスクリーンショットが撮れる
- [ ] そのスクリーンショットに日本語が豆腐（□）にならず表示されている
      ※ Debianベースは日本語フォントを含まないので要確認。欠けていればフォントを追加する
- [ ] コンテナ内で `claude` コマンドが起動し、認証済みである
- [ ] CLAUDE.mdとREADME.mdにホスト固有のパスが残っていない
      （`grep -rn "/home/hide" CLAUDE.md README.md` が何も返さない）

## 検討したが採らなかった案

- **devcontainer FeatureでPlaywrightを入れる** — ブラウザ版数を
  `playwright-core` のバージョンと独立に管理することになり、食い違いの余地が残る。
  `npx playwright install` ならロックファイルのバージョンに必ず一致する。
- **Node 20 のまま** — ホストに合わせる理由はあるが、devcontainerに移行する
  動機自体が「ホスト環境から切り離す」ことなので、合わせる意味が薄い。
- **docker-compose を使う** — DBなど他のサービスがないので、単一コンテナで足りる。
  必要になってから移行する。

## スコープ外

- CI（GitHub Actions）の構築。コンテナができればCIでも同じイメージを使えるが、
  別issueとして起票する。
- 本番デプロイ用のイメージ。
