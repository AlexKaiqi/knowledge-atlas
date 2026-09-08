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

// Exploration service. Text bodies are intentionally free-form; stable identity,
// access and immutable revisions form the protocol, not a teaching template.
export const actors = sqliteTable("ws_actors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  preferences: text("preferences").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});
export const explorations = sqliteTable("ws_explorations", {
  id: text("id").primaryKey(),
  owner: text("owner")
    .notNull()
    .references(() => actors.id),
  title: text("title").notNull(),
  visibility: text("visibility").notNull().default("private"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const members = sqliteTable(
  "ws_members",
  {
    space: text("space")
      .notNull()
      .references(() => explorations.id),
    actor: text("actor")
      .notNull()
      .references(() => actors.id),
    role: text("role").notNull(),
    joinedAt: integer("joined_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.space, t.actor] })],
);
export const messages = sqliteTable(
  "ws_messages",
  {
    id: text("id").primaryKey(),
    space: text("space")
      .notNull()
      .references(() => explorations.id),
    actor: text("actor")
      .notNull()
      .references(() => actors.id),
    body: text("body").notNull(),
    clientId: text("client_id").notNull(),
    digest: text("digest").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_ws_messages_space_time").on(t.space, t.createdAt)],
);
export const requests = sqliteTable(
  "ws_requests",
  {
    actor: text("actor").notNull(),
    key: text("key").notNull(),
    digest: text("digest").notNull(),
    response: text("response").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.actor, t.key] })],
);
export const artifacts = sqliteTable("ws_artifacts", {
  id: text("id").primaryKey(),
  space: text("space")
    .notNull()
    .references(() => explorations.id),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  version: integer("version").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const artifactVersions = sqliteTable(
  "ws_artifact_versions",
  {
    artifact: text("artifact")
      .notNull()
      .references(() => artifacts.id),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    metadata: text("metadata").notNull(),
    actor: text("actor")
      .notNull()
      .references(() => actors.id),
    sourceMessage: text("source_message"),
    job: text("job"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.artifact, t.version] })],
);
export const jobs = sqliteTable(
  "ws_jobs",
  {
    id: text("id").primaryKey(),
    space: text("space")
      .notNull()
      .references(() => explorations.id),
    actor: text("actor")
      .notNull()
      .references(() => actors.id),
    runner: text("runner").notNull(),
    input: text("input").notNull(),
    status: text("status").notNull(),
    attempt: integer("attempt").notNull().default(0),
    lease: text("lease"),
    leaseUntil: integer("lease_until"),
    error: text("error"),
    artifact: text("artifact"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_ws_jobs_status_lease").on(t.status, t.leaseUntil)],
);
export const documents = sqliteTable("ws_documents", {
  id: text("id").primaryKey(),
  owner: text("owner")
    .notNull()
    .references(() => actors.id),
  title: text("title").notNull(),
  visibility: text("visibility").notNull().default("private"),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull(),
  sourceArtifact: text("source_artifact").notNull(),
  sourceVersion: integer("source_version").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const documentVersions = sqliteTable(
  "ws_document_versions",
  {
    document: text("document")
      .notNull()
      .references(() => documents.id),
    version: integer("version").notNull(),
    visibility: text("visibility").notNull().default("private"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: text("metadata").notNull(),
    reason: text("reason").notNull(),
    actor: text("actor")
      .notNull()
      .references(() => actors.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.document, t.version] })],
);
export const relations = sqliteTable(
  "ws_relations",
  {
    document: text("document")
      .notNull()
      .references(() => documents.id),
    version: integer("version").notNull(),
    target: text("target").notNull(),
    kind: text("kind").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [primaryKey({ columns: [t.document, t.version, t.target, t.kind] })],
);
