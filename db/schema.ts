import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const discussions = sqliteTable(
  "discussions",
  {
    id: text("id").primaryKey(),
    target: text("target").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    nickname: text("nickname").notNull(),
    owner: text("owner").notNull(),
    parent: text("parent"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_discussions_target_created").on(t.target, t.createdAt),
    index("idx_discussions_parent").on(t.parent),
  ],
);
export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    target: text("target").notNull(),
    baseVersion: integer("base_version").notNull(),
    field: text("field").notNull(),
    before: text("before_text").notNull(),
    after: text("after_text").notNull(),
    reason: text("reason").notNull(),
    sources: text("sources").notNull(),
    nickname: text("nickname").notNull(),
    owner: text("owner").notNull(),
    status: text("status").notNull().default("proposed"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_revisions_target_created").on(t.target, t.createdAt)],
);
export const notes = sqliteTable(
  "notes",
  {
    owner: text("owner").notNull(),
    target: text("target").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: text("data").notNull(),
    stage: text("stage").notNull(),
    reviewAt: integer("review_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.target] }),
    index("idx_notes_owner_review").on(t.owner, t.reviewAt),
  ],
);
export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    target: text("target").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: text("data").notNull(),
    recordedAt: integer("recorded_at").notNull(),
  },
  (t) => [index("idx_observations_owner_recorded").on(t.owner, t.recordedAt)],
);
