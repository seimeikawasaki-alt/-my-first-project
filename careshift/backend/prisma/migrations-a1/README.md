# Phase A-1: マルチテナント3段階移行(設計書§9・§13-2 / ガードレール6)

「追加 → バックフィル → 制約強化」の3段階。NOT NULL追加とデータ移行を
同一ステップで行わない。

| ステージ | アーティファクト | 内容 |
|---|---|---|
| (1) 追加 | `01_tenant_skeleton.sql` | 新テーブル4種 + Group→Unit リネーム + tenantId(nullable)追加 |
| (2) バックフィル | `../backfill/a1-tenant-backfill.ts` | 既定法人/事業所の作成・tenantId充当・StaffAssignment生成 |
| (3) 制約強化 | `03_tenant_notnull.sql` | tenantId の DEFAULT+NOT NULL 化+インデックス追加 |

## 既存データがある環境(本番/検証)への適用手順

```bash
cd backend
psql "$DATABASE_URL" -f prisma/migrations-a1/01_tenant_skeleton.sql
npx tsx prisma/backfill/a1-tenant-backfill.ts
psql "$DATABASE_URL" -f prisma/migrations-a1/03_tenant_notnull.sql
npx prisma generate
```

## 開発環境(デモデータ・作り直してよい場合)の近道

seed が全データをテナント構造込みで再構築するため、リセットで一括反映できる:

```bash
cd backend
npx prisma db push --force-reset
npm run db:generate
npm run db:seed
```

## 注意

- このプロジェクトは従来 `db push` 運用のため `prisma migrate dev` の履歴が無い。
  本ディレクトリのSQLは migrate 履歴の代わりとなる「適用順序つきの移行スクリプト」。
  `prisma/migrations/` 形式への移行(baseline化)は本番展開時に別途行う。
- `DEFAULT 'tenant-default'` は A-1→A-2 間の暫定ブリッジ。A-2 のテナント
  コンテキスト注入(Prisma $extends)導入時に扱いを見直す。
- テーブル一覧を変更する場合は schema.prisma / backfill / 03 の3箇所を同期させること。
