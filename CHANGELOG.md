# Changelog

このプロジェクトの主な変更を記録します。形式は[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)を参考にし、バージョン番号は[Semantic Versioning](https://semver.org/lang/ja/)に従います。

## [1.2.0] - 2026-08-01

### Added

- BPMを推定値として`BPM ≈ 125`の形式で表示し、キーに`C (Am)`または`Am (C)`の形式で相対調を併記
- ポップアップを閉じた後も継続するoffscreen音声録音・解析
- 進捗と完了結果を復元するメモリ専用の`storage.session`状態管理
- モノラル化、BPM代替経路、権限、翻訳、メッセージ境界の自動回帰テスト
- PRと`main`へのpushで検証を行うGitHub Actions CI
- 同じGitコミットから同一ZIPを生成する再現可能なパッケージスクリプト

### Changed

- 対応Chromeバージョンを116以降として明示
- offscreen reasonを実際の録音・再生維持・sandbox解析処理に一致させた
- 音声バッファをChromeメッセージでJSON転送せず、offscreenからsandboxへ直接transferする構成へ変更
- READMEとプライバシーポリシーへ対応環境、権限、データ保持、ライセンス、公開手順を追記

### Fixed

- `PercivalBpmEstimator()`の戻り値全体ではなく、数値の`bpm`を使用するよう修正
- AudioWorkletや録音の初期化・タイムアウト・中断時にstreamとAudioContextを確実に解放
- service workerの再起動や結果通知失敗によって解析中状態が残り続ける経路を修正
- sandbox iframeとの`postMessage`で送信元windowを検証
- Essentia、AudioWorklet、sandboxを任意のウェブサイトへ公開していた設定を削除

## [1.1.0] - 2026-07-31

### Added

- プライバシーポリシーとポップアップ内のデータ取扱い表示
- Conventional Commits形式のPRタイトル検証
- タグ連動のGitHub Release作成workflow

### Changed

- 44.1 kHzでの音声取得とステレオからモノラルへの変換

[1.2.0]: https://github.com/ajshooting/Audio-Key-Analyzer/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ajshooting/Audio-Key-Analyzer/releases/tag/v1.1.0
