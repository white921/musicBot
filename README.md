# musicBot

Discord のテキストコマンドで操作する Music Bot です。最初のフェーズでは、Jockie Music の基本機能をコマンド中心で使えることを目標にしています。音源の取得には `yt-dlp` を使います。

## できること

- `m!p <url|query>` で YouTube URL または検索語から再生
- 再生中の `m!p` でキュー追加
- `m!queue` でキュー確認
- `m!np` で現在再生中の曲を確認
- `m!skip`, `m!pause`, `m!resume`
- `m!stop`, `m!leave`, `m!join`

## 必要環境

- Node.js 20+
- Discord Bot Token
- Discord Developer Portal で `MESSAGE CONTENT INTENT` を有効化

## セットアップ

```bash
cp .env.example .env
# .env を編集して DISCORD_TOKEN を設定

npm install
npm run check
npm run dev
```

本番ビルド:

```bash
npm run build
npm start
```

## 環境変数

- `DISCORD_TOKEN`
  Discord Bot Token
- `BOT_PREFIX`
  プレフィックス。未指定時は `m!`
- `YOUTUBE_COOKIE`
  任意。YouTube の cookie 文字列。Railway などの共有 IP 環境で `yt-dlp` / YouTube 取得が制限されるときの回避策
- `YOUTUBE_USER_AGENT`
  任意。YouTube 取得時に使う User-Agent。`yt-dlp` の 429 回避補助用
- `YTDLP_BINARY_PATH`
  任意。`yt-dlp` バイナリの場所。未指定時は Bot が `.bin/yt-dlp` に自動ダウンロードします

## コマンド一覧

- `m!p <url|query>`
- `m!join`
- `m!leave`
- `m!stop`
- `m!skip`
- `m!pause`
- `m!resume`
- `m!queue`
- `m!nowplaying`
- `m!help`

短縮形:

- `m!p`
- `m!q`
- `m!np`
- `m!s`

## 音声遅延について

この Bot では、`yt-dlp` で取得した音声をできるだけそのまま Discord に流す構成を優先し、余計な再エンコードを避けることで遅延や音ズレを減らす方針を取っています。

ただし、同じ VC にいる人同士で聞こえる音のズレは Discord の音声配信経路や各クライアント環境にも影響されるため、完全に 0 に固定できるとは限りません。

## よくある詰まりどころ

- テキストコマンドが反応しない
  `MESSAGE CONTENT INTENT` が無効の可能性があります
- `先にボイスチャンネルに参加してください。` が出る
  コマンド実行者が VC に入っていません
- 再生できない曲がある
  YouTube 側の制限や一時的な取得失敗の可能性があります
- Railway など本番環境で `Got 429 from the request` が出る
  YouTube 側のレート制限です。`YOUTUBE_COOKIE` と必要に応じて `YOUTUBE_USER_AGENT` を設定してください
- 初回起動で少し時間がかかる
  `yt-dlp` バイナリを自動ダウンロードしている可能性があります
