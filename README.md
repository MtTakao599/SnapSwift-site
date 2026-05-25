## SnapSwift v1.3.1

Linux AppImage の安定性を中心に改善しました。

### 改善
- Fedora / CachyOS で AppImage が白画面になる問題を修正
- Linux の WebKitGTK / EGL / Wayland 周りの起動安定性を改善
- Linux 動画再生の互換性を改善
- HEIF / HEIC 表示の ffmpeg 解決処理を改善
- Linux 互換性診断画面を追加
  - ffmpeg
  - HEVC / HEIF decode
  - GStreamer plugin
  - WebKit video policy
  を確認可能
- Linux 環境ごとの codec / plugin 導入コマンドを表示・コピー可能に変更
- Leaflet をローカル同梱し、起動時の CDN 通信を廃止
- 更新確認機能を追加
- 右クリック「フォルダで開く」を追加

### 修正
- Fedora / CachyOS での EGL_BAD_PARAMETER による起動失敗を修正
- Fedora の動画黒画面問題を改善
- CachyOS の GStreamer plugin 不足を診断できるよう改善
- HEIF / HEIC 警告文を OS 断定ではなく SnapSwift 内変換失敗として整理
- Linux 設定画面の配色を Windows 版に近づけました

### Notes
Linux では一部 codec / GStreamer plugin が OS 側に必要です。  
問題がある場合は、設定画面の「Linux 互換性」を確認してください。
