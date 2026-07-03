/**
 * Project Ontology 最小版
 *
 * 在 Project Brain（project_code_files / project_symbols / project_wiki）之上，
 * 抽取「实体 + 关系」让 /ask 能沿关系扩展上下文，而不是只做关键词搜索。
 *
 * 第一版只做启发式推断（按文件路径/宏名/commit message 推断 module/config），
 * 不追求 100% 准确，能覆盖 selfie/rx/tx/efuse 等典型模块即可。
 *
 * 数据模型：
 *   ontology_entities:  project/module/feature/config/build_target/file/symbol/
 *                       commit/bug/test_case/requirement/decision/document
 *   ontology_relations: hasModule/hasFeature/implementedBy/configuredBy/
 *                       testedBy/affectedBy/fixedBy/changes/mentions/dependsOn/
 *                       requires/explains/relatedTo
 *
 * 不引入 OWL/RDF/图数据库。所有数据存 SQLite，按 repoId 隔离。
 */

import { db } from './db/index';
import {
  repoSources,
  repoDocuments,
  projectCodeFiles,
  projectSymbols,
  wikiPages,
  wikiSpaces,
  ontologyEntities,
  ontologyRelations,
} from './db/schema';
import { eq, and, like, or } from 'drizzle-orm';
import { getProjectContext, getRepoCommitHistory } from './projectBrain';

// ─── 类型常量 ────────────────────────────────────────────────────────────────

export type EntityType =
  | 'project'
  | 'module'
  | 'feature'
  | 'config'
  | 'build_target'
  | 'file'
  | 'symbol'
  | 'commit'
  | 'bug'
  | 'test_case'
  | 'requirement'
  | 'decision'
  | 'document';

export const ENTITY_TYPES: EntityType[] = [
  'project', 'module', 'feature', 'config', 'build_target',
  'file', 'symbol', 'commit', 'bug', 'test_case',
  'requirement', 'decision', 'document',
];

export type RelationType =
  | 'hasModule'
  | 'hasFeature'
  | 'implementedBy'
  | 'configuredBy'
  | 'testedBy'
  | 'affectedBy'
  | 'fixedBy'
  | 'changes'
  | 'mentions'
  | 'dependsOn'
  | 'requires'
  | 'explains'
  | 'relatedTo';

export const RELATION_TYPES: RelationType[] = [
  'hasModule', 'hasFeature', 'implementedBy', 'configuredBy', 'testedBy',
  'affectedBy', 'fixedBy', 'changes', 'mentions', 'dependsOn',
  'requires', 'explains', 'relatedTo',
];

// ─── 模块推断规则 ────────────────────────────────────────────────────────────

interface ModuleInference {
  slug: string;
  name: string;
  aliases: string[];
  /** 路径/文件名匹配模式（小写） */
  patterns: string[];
}

const MODULE_INFERENCES: ModuleInference[] = [
  { slug: 'selfie', name: 'Selfie', aliases: ['自拍', 'selfie_app', 'ROBIN_SELFIE_BUILD'], patterns: ['selfie', 'robin_selfie'] },
  { slug: 'rx', name: 'RX', aliases: ['接收', 'robin_rx', 'rx_app'], patterns: ['robin_rx', '/rx/', 'rx_app', 'rx_boost'] },
  { slug: 'tx', name: 'TX', aliases: ['发射', 'robin_tx', 'tx_app'], patterns: ['robin_tx', '/tx/', 'tx_app'] },
  { slug: 'efuse', name: 'eFuse', aliases: ['efuse', 'robin_efuse', '电子熔丝'], patterns: ['efuse', 'robin_efuse'] },
  { slug: 'crypto', name: 'Crypto', aliases: ['加密', 'crypto'], patterns: ['crypto'] },
  { slug: 'hid', name: 'HID', aliases: ['HID', '人机接口'], patterns: ['hid'] },
  { slug: 'attributes', name: 'BLE Attributes', aliases: ['attributes', 'att_', 'gatt', 'BLE 属性'], patterns: ['attributes', 'att_', 'gatt'] },
  { slug: 'main', name: 'Main', aliases: ['主程序', 'main', 'app'], patterns: ['main.c', 'app.c', '/main/'] },
  { slug: 'power', name: 'Power', aliases: ['电源', '低功耗', 'sleep', '低功耗管理'], patterns: ['power', 'sleep', 'suspend', 'deepsleep', 'low_power'] },
  { slug: 'flash', name: 'Flash', aliases: ['flash', '存储'], patterns: ['flash'] },
  { slug: 'boot', name: 'Boot', aliases: ['启动', 'boot', 'bootloader'], patterns: ['boot', 'bootloader'] },
];

function inferModuleFromPath(relPath: string): ModuleInference | null {
  const lower = relPath.toLowerCase();
  for (const m of MODULE_INFERENCES) {
    for (const p of m.patterns) {
      if (lower.includes(p)) return m;
    }
  }
  return null;
}

// ─── 配置推断规则 ────────────────────────────────────────────────────────────

/**
 * 判断宏名是否是「配置项」。
 * 命中模式：
 *   - ROBIN_*, FPGA_*, FLASH_*, ROM_*, SUSPEND_*, DEEPSLEEP_*, EXTRA_*, BLE_*, APP_*
 *   - 以 _ENABLE / _MODE / _DISABLE / _CONFIG 结尾
 */
export function isConfigMacroName(name: string): boolean {
  if (!name || name.length < 3) return false;
  if (/^(ROBIN_|FPGA_|FLASH_|ROM_|SUSPEND_|DEEPSLEEP_|EXTRA_|BLE_|APP_|TC_)/.test(name)) return true;
  if (/_(ENABLE|MODE|DISABLE|CONFIG|BUILD|TARGET)$/.test(name)) return true;
  return false;
}

// ─── 通用工具 ────────────────────────────────────────────────────────────────

function canonicalize(entityType: EntityType, name: string): string {
  return `${entityType}:${name.toLowerCase().replace(/\s+/g, '_')}`;
}

interface EntityInsert {
  repoId: number;
  entityType: EntityType;
  name: string;
  canonicalName: string;
  aliases: string[];
  sourceType: string;
  sourceId: string;
  metadata: Record<string, any>;
}

interface RelationInsert {
  repoId: number;
  fromEntityType: EntityType;
  fromCanonicalName: string;
  relationType: RelationType;
  toEntityType: EntityType;
  toCanonicalName: string;
  confidence: 'high' | 'medium' | 'low';
  sourceRefs: Array<Record<string, any>>;
}

export interface BuildOntologyResult {
  ok: boolean;
  repoId: number;
  repoName: string;
  entities: number;
  relations: number;
  byEntityType: Record<string, number>;
  byRelationType: Record<string, number>;
  reason?: string;
}

interface BuildContext {
  repoId: number;
  repoName: string;
  entityIds: Map<string, number>;
  relationSeen: Set<string>;
  entities: number;
  relations: number;
  byEntityType: Record<string, number>;
  byRelationType: Record<string, number>;
}

function makeCtx(repoId: number, repoName: string): BuildContext {
  return {
    repoId,
    repoName,
    entityIds: new Map(),
    relationSeen: new Set(),
    entities: 0,
    relations: 0,
    byEntityType: {},
    byRelationType: {},
  };
}

function insertEntity(ctx: BuildContext, e: EntityInsert): number | null {
  const canonicalName = e.canonicalName || canonicalize(e.entityType, e.name);
  if (ctx.entityIds.has(canonicalName)) {
    // 已存在,不重复插入(第一版只追加 aliases)
    return ctx.entityIds.get(canonicalName)!;
  }
  const now = new Date().toISOString();
  try {
    // ON CONFLICT 兜底:canonicalName 唯一索引
    const ins = db
      .insert(ontologyEntities)
      .values({
        repoId: ctx.repoId,
        entityType: e.entityType,
        name: e.name,
        canonicalName,
        aliasesJson: JSON.stringify(e.aliases || []),
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        metadataJson: JSON.stringify(e.metadata || {}),
        createdAt: now,
        updatedAt: now,
      })
      .run() as any;
    const id = Number(ins.lastInsertRowid);
    ctx.entityIds.set(canonicalName, id);
    ctx.entities++;
    ctx.byEntityType[e.entityType] = (ctx.byEntityType[e.entityType] || 0) + 1;
    return id;
  } catch (err) {
    // 唯一约束冲突等,尝试查现有
    try {
      const existing = db
        .select()
        .from(ontologyEntities)
        .where(
          and(
            eq(ontologyEntities.repoId, ctx.repoId),
            eq(ontologyEntities.canonicalName, canonicalName)
          )
        )
        .all() as any[];
      if (existing.length > 0) {
        ctx.entityIds.set(canonicalName, existing[0].id);
        return existing[0].id;
      }
    } catch {}
    return null;
  }
}

function insertRelation(ctx: BuildContext, r: RelationInsert): void {
  const fromId = ctx.entityIds.get(r.fromCanonicalName);
  const toId = ctx.entityIds.get(r.toCanonicalName);
  if (!fromId || !toId) return;
  const tripleKey = `${fromId}|${r.relationType}|${toId}`;
  if (ctx.relationSeen.has(tripleKey)) return;
  ctx.relationSeen.add(tripleKey);
  const now = new Date().toISOString();
  try {
    db.insert(ontologyRelations)
      .values({
        repoId: ctx.repoId,
        fromEntityId: fromId,
        relationType: r.relationType,
        toEntityId: toId,
        confidence: r.confidence,
        sourceRefsJson: JSON.stringify(r.sourceRefs || []),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    ctx.relations++;
    ctx.byRelationType[r.relationType] = (ctx.byRelationType[r.relationType] || 0) + 1;
  } catch {
    // 唯一约束冲突,忽略
  }
}

// ─── 主构建流程 ──────────────────────────────────────────────────────────────

/**
 * 构建(重建)某 repo 的 ontology。
 *
 * 流程:
 *   1. 删除该 repo 旧的 entities + relations
 *   2. 创建 project entity
 *   3. 从 project_code_files 推断 modules + 创建 file entities
 *   4. 从 project_symbols 创建 symbol entities (限制数量)
 *   5. 从 macro symbols 推断 config entities
 *   6. 从 wiki_pages 创建 document entities + Project relatedTo Document
 *   7. 从 recent commits 创建 commit entities + Commit changes File
 *   8. 建立 Project hasModule Module / Module implementedBy File /
 *      File relatedTo Symbol / Module configuredBy Config 等关系
 */
export async function buildProjectOntology(repoName: string): Promise<BuildOntologyResult> {
  const ctx0 = getProjectContext(repoName);
  if (!ctx0) {
    return { ok: false, repoId: 0, repoName, entities: 0, relations: 0, byEntityType: {}, byRelationType: {}, reason: `repo not found or path invalid: ${repoName}` };
  }
  const { repoId, repoName: name } = ctx0;
  const ctx = makeCtx(repoId, name);

  // 1. 清空旧数据
  try {
    db.delete(ontologyRelations).where(eq(ontologyRelations.repoId, repoId)).run();
    db.delete(ontologyEntities).where(eq(ontologyEntities.repoId, repoId)).run();
  } catch (err) {
    return { ok: false, repoId, repoName: name, entities: 0, relations: 0, byEntityType: {}, byRelationType: {}, reason: `clear old ontology failed: ${String(err)}` };
  }

  // 2. Project entity
  const projectCanonical = canonicalize('project', name);
  insertEntity(ctx, {
    repoId,
    entityType: 'project',
    name,
    canonicalName: projectCanonical,
    aliases: [],
    sourceType: 'repo_sources',
    sourceId: String(repoId),
    metadata: {},
  });

  // 3. File entities + Module 推断
  const fileRows = db
    .select()
    .from(projectCodeFiles)
    .where(eq(projectCodeFiles.repoId, repoId))
    .all() as any[];

  // 收集 module → 文件
  const moduleToFilePaths = new Map<string, string[]>();
  // fileCanonical → fileId (DB id)
  const fileCanonicalToDbId = new Map<string, number>();

  for (const f of fileRows) {
    const relPath = String(f.relPath);
    const fileCanonical = canonicalize('file', relPath);
    const entityId = insertEntity(ctx, {
      repoId,
      entityType: 'file',
      name: relPath.split('/').pop() || relPath,
      canonicalName: fileCanonical,
      aliases: [relPath],
      sourceType: 'project_code_files',
      sourceId: String(f.id),
      metadata: {
        relPath,
        language: f.language,
        sizeBytes: f.sizeBytes,
      },
    });
    if (entityId) fileCanonicalToDbId.set(fileCanonical, entityId);

    // 推断 module
    const mod = inferModuleFromPath(relPath);
    if (mod) {
      if (!moduleToFilePaths.has(mod.slug)) moduleToFilePaths.set(mod.slug, []);
      moduleToFilePaths.get(mod.slug)!.push(relPath);
    }
  }

  // 4. Module entities + Project hasModule Module
  const moduleSlugToCanonical = new Map<string, string>();
  const moduleToFilePathsEntries = Array.from(moduleToFilePaths.entries());
  for (const [slug, paths] of moduleToFilePathsEntries) {
    const mod = MODULE_INFERENCES.find((m) => m.slug === slug);
    if (!mod) continue;
    const moduleCanonical = canonicalize('module', mod.name);
    insertEntity(ctx, {
      repoId,
      entityType: 'module',
      name: mod.name,
      canonicalName: moduleCanonical,
      aliases: mod.aliases,
      sourceType: 'inferred',
      sourceId: slug,
      metadata: { slug, filePaths: paths.slice(0, 20) },
    });
    moduleSlugToCanonical.set(slug, moduleCanonical);

    // Project hasModule Module
    insertRelation(ctx, {
      repoId,
      fromEntityType: 'project',
      fromCanonicalName: projectCanonical,
      relationType: 'hasModule',
      toEntityType: 'module',
      toCanonicalName: moduleCanonical,
      confidence: 'medium',
      sourceRefs: [{ kind: 'path_inference', paths: paths.slice(0, 5) }],
    });
  }

  // 5. Module implementedBy File
  for (const f of fileRows) {
    const relPath = String(f.relPath);
    const mod = inferModuleFromPath(relPath);
    if (!mod) continue;
    const moduleCanonical = moduleSlugToCanonical.get(mod.slug);
    if (!moduleCanonical) continue;
    const fileCanonical = canonicalize('file', relPath);
    insertRelation(ctx, {
      repoId,
      fromEntityType: 'module',
      fromCanonicalName: moduleCanonical,
      relationType: 'implementedBy',
      toEntityType: 'file',
      toCanonicalName: fileCanonical,
      confidence: 'medium',
      sourceRefs: [{ kind: 'path_inference', relPath }],
    });
  }

  // 6. Symbol entities (限制:每文件最多 5 个,只取 function/macro/struct/enum)
  // 同时收集 macro → 推断 config
  const symbolRows = db
    .select()
    .from(projectSymbols)
    .where(eq(projectSymbols.repoId, repoId))
    .all() as any[];

  // 按 fileId 分组,每文件最多 5 个 symbol entity
  const fileSymbolCount = new Map<number, number>();
  const configCanonicals = new Set<string>();

  for (const s of symbolRows) {
    const symbolType = String(s.symbolType);
    // 只索引重要类型
    if (!['function', 'macro', 'struct', 'enum', 'typedef', 'class'].includes(symbolType)) continue;

    const cnt = fileSymbolCount.get(s.fileId) || 0;
    if (cnt >= 5) continue;
    fileSymbolCount.set(s.fileId, cnt + 1);

    const symName = String(s.name);
    const symCanonical = canonicalize('symbol', `${symName}@${s.fileId}`);
    insertEntity(ctx, {
      repoId,
      entityType: 'symbol',
      name: symName,
      canonicalName: symCanonical,
      aliases: [symName],
      sourceType: 'project_symbols',
      sourceId: String(s.id),
      metadata: {
        symbolType,
        fileId: s.fileId,
        startLine: s.startLine,
        endLine: s.endLine,
        signature: s.signature,
      },
    });

    // File relatedTo Symbol
    const fileRow = fileRows.find((f) => f.id === s.fileId);
    if (fileRow) {
      const fileCanonical = canonicalize('file', String(fileRow.relPath));
      insertRelation(ctx, {
        repoId,
        fromEntityType: 'file',
        fromCanonicalName: fileCanonical,
        relationType: 'relatedTo',
        toEntityType: 'symbol',
        toCanonicalName: symCanonical,
        confidence: 'high',
        sourceRefs: [{ kind: 'symbol_in_file', fileId: s.fileId }],
      });
    }

    // 推断 config entity (macro 类型 + 名字匹配配置模式)
    if (symbolType === 'macro' && isConfigMacroName(symName)) {
      const configCanonical = canonicalize('config', symName);
      if (!configCanonicals.has(configCanonical)) {
        configCanonicals.add(configCanonical);
        insertEntity(ctx, {
          repoId,
          entityType: 'config',
          name: symName,
          canonicalName: configCanonical,
          aliases: [],
          sourceType: 'macro_inference',
          sourceId: String(s.id),
          metadata: {
            macroName: symName,
            definedInFileId: s.fileId,
            signature: s.signature,
          },
        });
      }

      // Module configuredBy Config (按定义该 macro 的文件推断 module)
      if (fileRow) {
        const mod = inferModuleFromPath(String(fileRow.relPath));
        if (mod) {
          const moduleCanonical = moduleSlugToCanonical.get(mod.slug);
          if (moduleCanonical) {
            insertRelation(ctx, {
              repoId,
              fromEntityType: 'module',
              fromCanonicalName: moduleCanonical,
              relationType: 'configuredBy',
              toEntityType: 'config',
              toCanonicalName: configCanonical,
              confidence: 'low',
              sourceRefs: [{ kind: 'macro_in_file', fileId: s.fileId, relPath: fileRow.relPath }],
            });
          }
        }
      }
    }
  }

  // 7. Document entities (从 wiki_pages 中 project wiki space 下的页面)
  try {
    const space = db
      .select()
      .from(wikiSpaces)
      .where(and(eq(wikiSpaces.sourceType, 'project'), eq(wikiSpaces.sourceId, repoId)))
      .all() as any[];
    if (space.length > 0) {
      const spaceId = space[0].id;
      const pages = db
        .select()
        .from(wikiPages)
        .where(eq(wikiPages.spaceId, spaceId))
        .all() as any[];
      for (const p of pages) {
        let pageType = 'document';
        try {
          const tags: string[] = JSON.parse(p.tagsJson || '[]');
          const t = tags.find((x) => x.startsWith('pageType:'));
          if (t) pageType = t.split(':')[1];
        } catch {}
        const docName = String(p.title || p.slug);
        const docCanonical = canonicalize('document', String(p.slug));
        insertEntity(ctx, {
          repoId,
          entityType: 'document',
          name: docName,
          canonicalName: docCanonical,
          aliases: [p.slug],
          sourceType: 'wiki_pages',
          sourceId: String(p.id),
          metadata: {
            pageId: p.id,
            slug: p.slug,
            pageType,
            confidence: p.confidence,
          },
        });
        // Project relatedTo Document
        insertRelation(ctx, {
          repoId,
          fromEntityType: 'project',
          fromCanonicalName: projectCanonical,
          relationType: 'relatedTo',
          toEntityType: 'document',
          toCanonicalName: docCanonical,
          confidence: 'high',
          sourceRefs: [{ kind: 'wiki_page', pageId: p.id }],
        });
      }
    }
  } catch (err) {
    console.error('[projectOntology] document extraction failed:', err);
  }

  // 8. Commit entities (最近 30 天 100 条)
  try {
    const commits = await getRepoCommitHistory(repoId, 30, 100);
    for (const c of commits) {
      const commitCanonical = canonicalize('commit', c.shortHash);
      insertEntity(ctx, {
        repoId,
        entityType: 'commit',
        name: c.shortHash,
        canonicalName: commitCanonical,
        aliases: [c.hash],
        sourceType: 'git_log',
        sourceId: c.hash,
        metadata: {
          hash: c.hash,
          shortHash: c.shortHash,
          author: c.author,
          date: c.date,
          message: c.message,
        },
      });
      // Commit changes File + Commit relatedTo Module
      for (const changedPath of c.changedFiles.slice(0, 20)) {
        const fileCanonical = canonicalize('file', changedPath);
        // 如果文件已在 file entities 中,建立 changes 关系;否则跳过(不创建悬空 file entity)
        if (ctx.entityIds.has(fileCanonical)) {
          insertRelation(ctx, {
            repoId,
            fromEntityType: 'commit',
            fromCanonicalName: commitCanonical,
            relationType: 'changes',
            toEntityType: 'file',
            toCanonicalName: fileCanonical,
            confidence: 'high',
            sourceRefs: [{ kind: 'git_diff', path: changedPath }],
          });
          // Commit relatedTo Module (基于该文件推断的 module)
          const mod = inferModuleFromPath(changedPath);
          if (mod) {
            const moduleCanonical = moduleSlugToCanonical.get(mod.slug);
            if (moduleCanonical) {
              insertRelation(ctx, {
                repoId,
                fromEntityType: 'commit',
                fromCanonicalName: commitCanonical,
                relationType: 'relatedTo',
                toEntityType: 'module',
                toCanonicalName: moduleCanonical,
                confidence: 'low',
                sourceRefs: [{ kind: 'commit_changed_module_file', path: changedPath }],
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[projectOntology] commit extraction failed:', err);
  }

  return {
    ok: true,
    repoId,
    repoName: name,
    entities: ctx.entities,
    relations: ctx.relations,
    byEntityType: ctx.byEntityType,
    byRelationType: ctx.byRelationType,
  };
}

// ─── 查询 ────────────────────────────────────────────────────────────────────

export interface OntologyEntity {
  id: number;
  repoId: number;
  entityType: EntityType;
  name: string;
  canonicalName: string;
  aliases: string[];
  sourceType: string;
  sourceId: string;
  metadata: Record<string, any>;
}

export interface OntologyRelation {
  id: number;
  repoId: number;
  fromEntity: OntologyEntity;
  relationType: RelationType;
  toEntity: OntologyEntity;
  confidence: string;
  sourceRefs: any[];
}

export interface EntitySearchHit {
  entity: OntologyEntity;
  score: number;
  matchedField: 'name' | 'canonical' | 'alias';
}

function rowToEntity(row: any): OntologyEntity {
  let aliases: string[] = [];
  try { aliases = JSON.parse(row.aliasesJson || '[]'); } catch {}
  let metadata: Record<string, any> = {};
  try { metadata = JSON.parse(row.metadataJson || '{}'); } catch {}
  return {
    id: row.id,
    repoId: row.repoId,
    entityType: row.entityType,
    name: row.name,
    canonicalName: row.canonicalName,
    aliases,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    metadata,
  };
}

/**
 * 在 ontology_entities 中搜索匹配 terms 的实体。
 * 命中字段:name (100) > alias (60) > canonical (40) > name LIKE (20)
 */
export function searchOntologyEntities(
  repoId: number,
  terms: string[],
  entityTypes?: EntityType[]
): EntitySearchHit[] {
  if (terms.length === 0) return [];
  const hits: EntitySearchHit[] = [];

  try {
    const allEntities = db
      .select()
      .from(ontologyEntities)
      .where(eq(ontologyEntities.repoId, repoId))
      .all() as any[];

    for (const row of allEntities) {
      if (entityTypes && entityTypes.length > 0 && !entityTypes.includes(row.entityType)) continue;
      const entity = rowToEntity(row);
      let score = 0;
      let matchedField: EntitySearchHit['matchedField'] = 'name';

      const nameLower = String(entity.name).toLowerCase();
      const canonicalLower = String(entity.canonicalName).toLowerCase();
      const aliasesLower = entity.aliases.map((a) => String(a).toLowerCase());

      for (const term of terms) {
        const t = term.toLowerCase();
        if (!t || t.length < 2) continue;
        if (nameLower === t) { score += 100; matchedField = 'name'; }
        else if (aliasesLower.includes(t)) { score += 60; matchedField = 'alias'; }
        else if (canonicalLower === t) { score += 40; matchedField = 'canonical'; }
        else if (nameLower.includes(t)) { score += 20; matchedField = 'name'; }
        else if (aliasesLower.some((a) => a.includes(t))) { score += 15; matchedField = 'alias'; }
      }

      if (score > 0) hits.push({ entity, score, matchedField });
    }
  } catch (err) {
    console.error('[projectOntology] searchOntologyEntities error:', err);
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 20);
}

/**
 * 取 entity 的 1-hop 关系(出 + 入),返回关系 + 对端 entity。
 */
export function getEntityRelations(entityId: number): OntologyRelation[] {
  const out: OntologyRelation[] = [];

  try {
    // 出关系
    const outRows = db
      .select()
      .from(ontologyRelations)
      .where(eq(ontologyRelations.fromEntityId, entityId))
      .all() as any[];
    // 入关系
    const inRows = db
      .select()
      .from(ontologyRelations)
      .where(eq(ontologyRelations.toEntityId, entityId))
      .all() as any[];

    const entityIds = new Set<number>();
    for (const r of [...outRows, ...inRows]) {
      entityIds.add(r.fromEntityId);
      entityIds.add(r.toEntityId);
    }

    const entityMap = new Map<number, OntologyEntity>();
    if (entityIds.size > 0) {
      const allEntities = db
        .select()
        .from(ontologyEntities)
        .all() as any[];
      for (const e of allEntities) {
        if (entityIds.has(e.id)) entityMap.set(e.id, rowToEntity(e));
      }
    }

    for (const r of outRows) {
      const from = entityMap.get(r.fromEntityId);
      const to = entityMap.get(r.toEntityId);
      if (!from || !to) continue;
      let sourceRefs: any[] = [];
      try { sourceRefs = JSON.parse(r.sourceRefsJson || '[]'); } catch {}
      out.push({
        id: r.id,
        repoId: r.repoId,
        fromEntity: from,
        relationType: r.relationType,
        toEntity: to,
        confidence: r.confidence,
        sourceRefs,
      });
    }
    for (const r of inRows) {
      const from = entityMap.get(r.fromEntityId);
      const to = entityMap.get(r.toEntityId);
      if (!from || !to) continue;
      let sourceRefs: any[] = [];
      try { sourceRefs = JSON.parse(r.sourceRefsJson || '[]'); } catch {}
      out.push({
        id: r.id,
        repoId: r.repoId,
        fromEntity: from,
        relationType: r.relationType,
        toEntity: to,
        confidence: r.confidence,
        sourceRefs,
      });
    }
  } catch (err) {
    console.error('[projectOntology] getEntityRelations error:', err);
  }

  return out;
}

/**
 * 取一组 entity 的 1-hop 关系聚合(用于 /ask 构造上下文)。
 * 返回每条:{ from, relationType, to, direction }
 */
export interface OntologyContextEdge {
  fromName: string;
  fromType: EntityType;
  relationType: RelationType;
  toName: string;
  toType: EntityType;
  confidence: string;
}

export function getOntologyContextEdges(entityIds: number[], maxEdges = 50): OntologyContextEdge[] {
  if (entityIds.length === 0) return [];
  const edges: OntologyContextEdge[] = [];
  const seen = new Set<string>();

  // 限制传入 entity 数量,避免查询过多
  for (const eid of entityIds.slice(0, 10)) {
    const rels = getEntityRelations(eid);
    for (const r of rels) {
      const key = `${r.fromEntity.id}|${r.relationType}|${r.toEntity.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        fromName: r.fromEntity.name,
        fromType: r.fromEntity.entityType,
        relationType: r.relationType,
        toName: r.toEntity.name,
        toType: r.toEntity.entityType,
        confidence: r.confidence,
      });
      if (edges.length >= maxEdges) return edges;
    }
  }
  return edges;
}

// ─── 状态/列表查询 ───────────────────────────────────────────────────────────

export interface OntologySummary {
  repoId: number;
  repoName: string;
  entityCount: number;
  relationCount: number;
  byEntityType: Record<string, number>;
  byRelationType: Record<string, number>;
}

export function getOntologySummary(repoId: number, repoName: string): OntologySummary {
  const entities = db
    .select()
    .from(ontologyEntities)
    .where(eq(ontologyEntities.repoId, repoId))
    .all() as any[];
  const relations = db
    .select()
    .from(ontologyRelations)
    .where(eq(ontologyRelations.repoId, repoId))
    .all() as any[];

  const byEntityType: Record<string, number> = {};
  for (const e of entities) {
    byEntityType[e.entityType] = (byEntityType[e.entityType] || 0) + 1;
  }
  const byRelationType: Record<string, number> = {};
  for (const r of relations) {
    byRelationType[r.relationType] = (byRelationType[r.relationType] || 0) + 1;
  }
  return {
    repoId,
    repoName,
    entityCount: entities.length,
    relationCount: relations.length,
    byEntityType,
    byRelationType,
  };
}

/**
 * 列出某 repo 的所有实体(可选按 entityType 过滤、按 name/canonical LIKE 搜索)。
 * 第一版用于 GET /api/project-brain/ontology。
 */
export function listOntologyEntities(
  repoId: number,
  opts?: { entityType?: EntityType; q?: string; limit?: number }
): OntologyEntity[] {
  const limit = opts?.limit || 200;
  try {
    let rows: any[];
    if (opts?.entityType && opts?.q) {
      const pattern = `%${opts.q}%`;
      rows = db
        .select()
        .from(ontologyEntities)
        .where(
          and(
            eq(ontologyEntities.repoId, repoId),
            eq(ontologyEntities.entityType, opts.entityType),
            or(
              like(ontologyEntities.name, pattern),
              like(ontologyEntities.canonicalName, pattern),
              like(ontologyEntities.aliasesJson, pattern)
            )
          )
        )
        .limit(limit)
        .all() as any[];
    } else if (opts?.entityType) {
      rows = db
        .select()
        .from(ontologyEntities)
        .where(
          and(
            eq(ontologyEntities.repoId, repoId),
            eq(ontologyEntities.entityType, opts.entityType)
          )
        )
        .limit(limit)
        .all() as any[];
    } else if (opts?.q) {
      const pattern = `%${opts.q}%`;
      rows = db
        .select()
        .from(ontologyEntities)
        .where(
          and(
            eq(ontologyEntities.repoId, repoId),
            or(
              like(ontologyEntities.name, pattern),
              like(ontologyEntities.canonicalName, pattern),
              like(ontologyEntities.aliasesJson, pattern)
            )
          )
        )
        .limit(limit)
        .all() as any[];
    } else {
      rows = db
        .select()
        .from(ontologyEntities)
        .where(eq(ontologyEntities.repoId, repoId))
        .limit(limit)
        .all() as any[];
    }
    return rows.map(rowToEntity);
  } catch (err) {
    console.error('[projectOntology] listOntologyEntities error:', err);
    return [];
  }
}
