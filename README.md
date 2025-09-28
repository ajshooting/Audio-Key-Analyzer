# Key Finder - Chrome Extension

Chrome 拡張機能として再生中音声を録音し、Essentia.js を使ってキーとBPMを推定します。

## ファイル構成

- [popup.html](popup.html) / [popup.js](popup.js): ユーザーが録音開始・結果確認を行う UI と、録音・進捗表示・結果受信ロジックを提供。
- [audio-processor.js](audio-processor.js): `AudioWorkletProcessor` として音声チャンクを収集し、[`popup.js`](popup.js) に送信。
- [background.js](background.js): Popup から受け取った音声データを保持し、オフスクリーン文書とサンドボックス iframe を初期化して解析を委譲、結果を Popup に返却。
- [offscreen.html](offscreen.html) / [offscreen.js](offscreen.js): バックグラウンド専用のオフスクリーン文書。Sandbox iframe を生成し、`chrome.runtime` 経由でメッセージを中継。
- [sandbox.html](sandbox.html) / [sandbox.js](sandbox.js): Essentia WASM を読み込み、`parent.postMessage` で [`offscreen.js`](offscreen.js) と通信しながらキー/BPM 解析を実行。

## 使い方

1. 拡張機能を Chrome に読み込み、ポップアップで録音秒数を設定し「キー・BPM推定を開始」を押す。
2. 指定秒数録音後、自動で解析され、結果がポップアップに表示されます。