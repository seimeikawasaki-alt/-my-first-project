# CareShift 開発規約(Claude Code向け)

## プロジェクト概要
介護事業者向けのシフト・勤怠・給与管理SaaS。現在MVPから商用版(v2)へ改修中。
全体方針・仕様の正は `docs/CareShift_商用化追加設計書_v1.0.md`。
迷ったら必ず設計書の該当セクションを読んでから実装すること。

## 作業ディレクトリ・起動コマンド
このリポジトリは `~/-my-first-project/careshift` 配下にある(README記載の
`~/my-first-project/careshift` とは別。**こちらが正**)。

```bash
# backend
cd ~/-my-first-project/careshift/backend && npm run dev

# frontend(別ターミナル)
cd ~/-my-first-project/careshift/frontend && npm run dev
```

動作確認・手動テストが必要なタスクでは、上記2つを起動した状態で
http://localhost:5173 を叩いて確認すること。DBマイグレーション後は
`npm run db:seed`(必要なら `npm run db:seed:attendance`)を忘れずに実行する。
バックグラウンド起動する場合はログを `backend.log` / `frontend.log` 等に
リダイレクトし、作業終了時にプロセスを残さないこと。

## 技術スタック
- frontend/: React 18 + TypeScript + Vite + Tailwind + Zustand + axios
- backend/:  Node.js + Express + TypeScript + Prisma + PostgreSQL
- テスト: Vitest(backend/src/**/*.test.ts)

## 絶対に守るルール(ガードレール)
1. `payroll.calc.ts` の端数処理仕様(中間4桁保持・時間は分単位2桁・最終金額1円未満切り捨て)を変更しない。変更が必要な場合は実装せず理由を報告して停止する
2. `zengin.ts`(全銀フォーマット)は削除・改修しない。タスクZ-1でフラグ隔離するのみ
3. 税金・社会保険料の計算ロジックを新規実装しない(設計書§4.1の役割分担)
4. 配置基準・加算の具体数値(3:1等)はコードに直書きせず、必ずシード/マスタデータとして投入する(設計書§0.2)
5. 既存APIのレスポンス形状を壊す変更をする場合、必ず変更点を報告に含める
6. マイグレーションは「追加 → バックフィル → 制約強化」の3段階に分け、1マイグレーションでNOT NULL追加とデータ移行を同時に行わない
7. 秘密情報(.env)をコミットしない。新しい環境変数を追加したら .env.example を必ず更新する

## コーディング規約
- 既存コードのスタイル(命名・ディレクトリ構成・zodバリデーション・asyncHandler・response util・auditログ)に合わせる。新しいパターンを勝手に導入しない
- 書き込み系APIには必ず `audit.ts` 経由で監査ログを記録する
- 新規サービスは `backend/src/services/` に `xxx.service.ts`(DB依存)と `xxx.calc.ts`(純粋関数)を分離し、calc側にVitestテストを書く
- フロントの新規画面は既存の components/common(Toast/Skeleton/EmptyState/Modal)を再利用する
- 日付処理は既存の `shiftRules.calc.ts` のユーティリティ(dateKey/addUTCDays等)を使う。UTC基準を崩さない

## 各タスク共通の完了手順
1. `cd backend && npm test` が全件パスすること
2. `cd backend && npx tsc --noEmit` / `cd frontend && npx tsc --noEmit` がエラーなし
3. 変更ファイル一覧・追加した環境変数・マイグレーション名・残課題を箇条書きで報告する
4. スキーマを変更した場合は `npx prisma migrate dev --name <説明的な名前>` を実行し、seed が壊れていないか `npm run db:seed` で確認する
