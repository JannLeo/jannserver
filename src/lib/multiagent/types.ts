// ─── Multi-Agent DAG Type Definitions ────────────────────────────────────────

/** 一个 DAG 节点（Agent） */
export interface AgentNode<I = any, O = any> {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 依赖的节点 ID 列表（这些节点执行完后才执行本节点） */
  deps: string[];
  /** 执行函数：接收上游节点输出，返回本节点输出 */
  fn: (inputs: Record<string, any>, ctx: RunContext) => Promise<O>;
  /** 可选：超时（毫秒），默认 120_000 */
  timeout?: number;
  /** 可选：重试次数 */
  retries?: number;
}

/** 一次 DAG 运行 */
export interface DagRun {
  /** 运行的唯一标识 */
  id: string;
  /** 开始时间 */
  startedAt: number;
  /** 节点结果 */
  nodeResults: Record<string, NodeResult>;
  /** 全局状态 */
  status: 'running' | 'completed' | 'failed';
}

/** 单个节点运行结果 */
export interface NodeResult {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: any;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

/** 运行上下文 */
export interface RunContext {
  dagId: string;
  signal: AbortSignal;
  log: (msg: string) => void;
  /** 运行初始化参数（如 date 等），由执行引擎传入 */
  [key: string]: any;
}

/** DAG 定义 */
export interface DagDefinition {
  id: string;
  name: string;
  nodes: AgentNode[];
}

/** 执行结果 */
export interface DagResult {
  dagId: string;
  status: 'completed' | 'failed';
  outputs: Record<string, any>;
  nodeResults: Record<string, NodeResult>;
  totalDurationMs: number;
  error?: string;
}