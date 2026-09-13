// ─── Multi-Agent DAG Execution Engine ────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type {
  AgentNode,
  DagDefinition,
  DagResult,
  DagRun,
  NodeResult,
  RunContext,
} from './types';

/** 拓扑排序：返回可并行执行的层级 */
function topologicalSort(nodes: AgentNode[]): string[][] {
  const nodeMap = new Map<string, AgentNode>();
  const inDegree = new Map<string, number>();
  const deps = new Map<string, string[]>();

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    inDegree.set(n.id, n.deps.length);
    deps.set(n.id, n.deps);
  }

  const levels: string[][] = [];
  const completed = new Set<string>();

  while (completed.size < nodes.length) {
    // 找出所有入度为 0 的节点（无依赖或依赖已完成）
    const ready = nodes
      .filter(n => !completed.has(n.id) && (n.deps.length === 0 || n.deps.every(d => completed.has(d))))
      .map(n => n.id);

    if (ready.length === 0) {
      // 环形依赖检测
      throw new Error('DAG 有环形依赖，无法执行');
    }

    levels.push(ready);
    ready.forEach(id => completed.add(id));
  }

  return levels;
}

/** DAG 执行引擎 */
export class DagExecutor {
  private nodes: Map<string, AgentNode>;
  private levels: string[][];
  private nodeMap: Map<string, AgentNode>;

  constructor(dag: DagDefinition) {
    this.nodes = new Map(dag.nodes.map(n => [n.id, n]));
    this.nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
    this.levels = topologicalSort(dag.nodes);
  }

  getLevels(): string[][] {
    return this.levels;
  }

  getNode(nodeId: string): AgentNode | undefined {
    return this.nodes.get(nodeId);
  }

  /** 执行 DAG，返回最终结果 */
  async execute(initialInputs: Record<string, any> = {}, signal?: AbortSignal): Promise<DagResult> {
    const startTime = Date.now();
    const runId = uuidv4().slice(0, 8);
    const nodeResults: Record<string, NodeResult> = {};
    const outputs: Record<string, any> = { ...initialInputs };
    const logs: string[] = [];

    // 初始化所有节点状态
    for (const node of this.nodes.values()) {
      nodeResults[node.id] = {
        nodeId: node.id,
        status: 'pending',
      };
    }

    // 将 initialInputs 的内容合并到 ctx 中，方便节点访问
    const ctx: RunContext = {
      dagId: runId,
      signal: signal || new AbortController().signal,
      ...initialInputs, // 把 date 等参数直接放到 ctx 上
      log: (msg: string) => {
        const timestamp = new Date().toISOString().slice(11, 23);
        logs.push(`[${timestamp}] ${msg}`);
      },
    };

    try {
      // 按层级执行（同一层可并行）
      for (let levelIdx = 0; levelIdx < this.levels.length; levelIdx++) {
        const level = this.levels[levelIdx];
        ctx.log(`[Level ${levelIdx + 1}/${this.levels.length}] Executing: ${level.join(', ')}`);

        const levelPromises = level.map(nodeId => this.executeNode(nodeId, nodeResults, outputs, ctx));
        const levelResults = await Promise.allSettled(levelPromises);

        // 检查是否有失败
        for (let i = 0; i < level.length; i++) {
          const result = levelResults[i];
          if (result.status === 'rejected') {
            ctx.log(`[ERROR] ${level[i]} failed: ${result.reason}`);
          }
        }
      }

      return {
        dagId: runId,
        status: 'completed',
        outputs,
        nodeResults,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        dagId: runId,
        status: 'failed',
        outputs,
        nodeResults,
        totalDurationMs: Date.now() - startTime,
        error: err.message,
      };
    }
  }

  /** 执行单个节点 */
  private async executeNode(
    nodeId: string,
    nodeResults: Record<string, NodeResult>,
    outputs: Record<string, any>,
    ctx: RunContext
  ): Promise<any> {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const timeout = node.timeout || 120_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      nodeResults[nodeId].status = 'running';
      nodeResults[nodeId].startedAt = Date.now();
      ctx.log(`  → ${node.name}: starting...`);

      // 收集依赖输出
      const inputs: Record<string, any> = {};
      for (const depId of node.deps) {
        inputs[depId] = outputs[depId];
      }

      const result = await node.fn(inputs, ctx);

      clearTimeout(timeoutId);
      nodeResults[nodeId].status = 'completed';
      nodeResults[nodeId].output = result;
      nodeResults[nodeId].completedAt = Date.now();
      nodeResults[nodeId].durationMs = nodeResults[nodeId].completedAt - (nodeResults[nodeId].startedAt || 0);
      outputs[nodeId] = result;

      ctx.log(`  ✓ ${node.name}: completed (${nodeResults[nodeId].durationMs}ms)`);

      return result;
    } catch (err: any) {
      clearTimeout(timeoutId);
      nodeResults[nodeId].status = 'failed';
      nodeResults[nodeId].error = err.message;
      nodeResults[nodeId].completedAt = Date.now();
      nodeResults[nodeId].durationMs = nodeResults[nodeId].completedAt - (nodeResults[nodeId].startedAt || 0);

      ctx.log(`  ✗ ${node.name}: ${err.message}`);

      // 如果节点是 critical 的，抛出错误终止 DAG
      // 目前是所有节点都运行完，错误记录在结果中
      return undefined;
    }
  }
}

/** 创建 DAG 并立即执行 */
export async function executeDag<T extends Record<string, any>>(
  dag: DagDefinition,
  initialInputs: Record<string, any> = {},
  signal?: AbortSignal
): Promise<DagResult> {
  const executor = new DagExecutor(dag);
  return executor.execute(initialInputs, signal);
}