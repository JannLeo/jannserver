/**
 * herdr-socket.ts
 * JSON-RPC client for herdr Unix socket API.
 * Socket path: ~/.config/herdr/herdr.sock (respects HERDR_SOCKET_PATH env).
 */

import { Socket } from 'net';

export interface RpcRequest {
  id?: string | number;
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
}

export interface RpcSuccessResponse {
  id: string | number | null;
  result: unknown;
}

export interface RpcErrorResponse {
  id: string | number | null;
  error: {
    code: string;
    message: string;
    data?: unknown;
  };
}

export type RpcResponse = RpcSuccessResponse | RpcErrorResponse;

function getSocketPath(): string {
  if (process.env.HERDR_SOCKET_PATH) return process.env.HERDR_SOCKET_PATH;
  // Try techlead profile first (main running instance), fallback to current user config
  const techleadPath = '/home/sz/.hermes/profiles/techlead/home/.config/herdr/herdr.sock';
  const defaultPath = '/home/sz/.config/herdr/herdr.sock';
  const { existsSync } = require('fs');
  if (existsSync(techleadPath)) return techleadPath;
  if (existsSync(defaultPath)) return defaultPath;
  return techleadPath;
}

// ─── Socket pool (one socket, reused) ─────────────────────────────────────

let _socket: Socket | null = null;
let _connectPromise: Promise<Socket> | null = null;

async function getSocket(): Promise<Socket> {
  if (_socket && !_socket.destroyed) return _socket;
  if (_connectPromise) return _connectPromise;

  _connectPromise = new Promise((resolve, reject) => {
    const sock = new Socket();
    sock.setTimeout(5000);

    const cleanup = () => {
      _socket = null;
      _connectPromise = null;
    };

    sock.on('error', (err) => { cleanup(); reject(err); });
    sock.on('timeout', () => { sock.destroy(); cleanup(); reject(new Error('Socket connection timeout (5s)')); });
    sock.on('close', () => { cleanup(); });

    sock.connect(getSocketPath(), () => {
      _connectPromise = null;
      _socket = sock;
      resolve(sock);
    });
  });

  return _connectPromise;
}

let _idCounter = 1;

export async function rpcCall(method: string, params?: any): Promise<RpcResponse> {
  const id = String(_idCounter++);
  const request: RpcRequest = { id, method, params: params ?? {} };
  const buf = Buffer.from(JSON.stringify(request) + '\n');

  return new Promise((resolve, reject) => {
    getSocket()
      .then((sock) => {
        const timer = setTimeout(() => reject(new Error(`RPC ${method} timeout (5s)`)), 5000);
        const chunks: Buffer[] = [];

        const onData = (d: Buffer) => chunks.push(d);
        const onClose = () => {
          clearTimeout(timer);
          sock.off('data', onData);
          sock.off('close', onClose);
          sock.off('error', onErr);
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()) as RpcResponse);
          } catch {
            reject(new Error(`Invalid JSON: ${Buffer.concat(chunks).slice(0, 200)}`));
          }
        };
        const onErr = (err: Error) => {
          clearTimeout(timer);
          sock.off('data', onData);
          sock.off('close', onClose);
          sock.off('error', onErr);
          _socket = null;
          reject(err);
        };

        sock.on('data', onData);
        sock.once('close', onClose);
        sock.once('error', onErr);

        sock.write(buf, (err) => {
          if (err) { onErr(err); }
        });
      })
      .catch(reject);
  });
}

export async function rpcMethod<T = unknown>(
  method: string,
  params?: any
): Promise<T> {
  const resp = await rpcCall(method, params);
  if ('error' in resp) {
    throw new HerdrRpcError(resp.error.code, resp.error.message, resp.error.data);
  }
  return resp.result as T;
}

export class HerdrRpcError extends Error {
  constructor(
    public code: string,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'HerdrRpcError';
  }
}

// ─── Typed API helpers ─────────────────────────────────────────────────────

export type SplitDirection = "right" | "down";

// ── Result / event types ────────────────────────────────────────────────

export interface PongResult {
  version: string;
  protocol: number;
  capabilities?: Record<string, unknown>;
}

export interface AgentInfo {
  terminal_id: string;
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  agent: string | null;
  agent_status: "idle" | "working" | "blocked" | "done" | "unknown";
  display_agent: string | null;
  custom_status: string | null;
  state_labels: Record<string, string>;
  name: string | null;
  cwd: string | null;
  title: string | null;
  focused: boolean;
  foreground_cwd: string | null;
  revision: number;
  screen_detection_skipped: boolean;
  agent_session: unknown | null;
}

// ── P0 parameter types ───────────────────────────────────────────────────

export interface AgentStartParams {
  name: string;
  argv: string[];
  cwd?: string | null;
  env?: Record<string, string>;
  focus?: boolean;
  split?: SplitDirection | null;
  tab_id?: string | null;
  workspace_id?: string | null;
}

export interface AgentSendParams {
  target: string;
  text: string;
}

export interface AgentTarget {
  target: string;
}

export interface AgentReadParams {
  target: string;
  lines?: number | null;
  format?: "text" | "ansi";
  source?: "visible" | "recent" | "recent_unwrapped" | "detection";
  strip_ansi?: boolean;
}

export interface AgentRenameParams {
  target: string;
  name: string;
}

export interface PaneSplitParams {
  direction: SplitDirection;
  cwd?: string | null;
  env?: Record<string, string>;
  focus?: boolean;
  ratio?: number | null;
  target_pane_id?: string | null;
  workspace_id?: string | null;
}

export interface PaneSendTextParams {
  pane_id: string;
  text: string;
}

export interface PaneSendKeysParams {
  pane_id: string;
  keys: string;
}

export interface PaneSendInputParams {
  pane_id: string;
  input: string;
}

export interface PaneTarget {
  pane_id: string;
}

export interface PaneReadParams {
  pane_id: string;
  source: "visible" | "recent" | "recent_unwrapped" | "detection";
  lines?: number | null;
  format?: "text" | "ansi";
  strip_ansi?: boolean;
}

export interface PaneListParams {
  workspace_id?: string | null;
}

export interface PaneRenameParams {
  pane_id: string;
  label: string;
}

export interface PaneSwapParams {
  pane_id_a: string;
  pane_id_b: string;
}

export interface PaneMoveParams {
  pane_id: string;
  direction: string;
}

export interface PaneZoomParams {
  pane_id: string;
  zoom: boolean;
}

export interface PaneResizeParams {
  pane_id: string;
  direction: string;
  amount: number;
}

export interface PaneFocusDirectionParams {
  pane_id: string;
  direction: string;
}

export interface PaneNeighborParams {
  pane_id: string;
  direction: string;
}

export interface PaneEdgesParams {
  pane_id: string;
}

export interface PaneCurrentParams {
  workspace_id?: string | null;
}

export interface PaneProcessInfoParams {
  pane_id: string;
}

export interface PaneAgentStatusChangedEvent {
  pane_id: string;
  workspace_id: string;
  agent: string | null;
  display_agent: string | null;
  agent_status: string;
  title: string | null;
  custom_status: string | null;
  state_labels: Record<string, string>;
}

export interface PaneOutputMatchedEvent {
  pane_id: string;
  matched_line: string;
  read: unknown;
}

// ── P1 parameter types ───────────────────────────────────────────────────

export interface TabCreateParams {
  label?: string | null;
  cwd?: string | null;
  env?: Record<string, string>;
  focus?: boolean;
  workspace_id?: string | null;
}

export interface TabTarget {
  tab_id: string;
}

export interface TabRenameParams {
  tab_id: string;
  label: string;
}

export interface TabMoveParams {
  tab_id: string;
  insert_index: number;
}

export interface TabListParams {
  workspace_id?: string | null;
}

export interface WorkspaceCreateParams {
  label?: string | null;
  cwd?: string | null;
  env?: Record<string, string>;
  focus?: boolean;
}

export interface WorkspaceTarget {
  workspace_id: string;
}

export interface WorkspaceRenameParams {
  workspace_id: string;
  label: string;
}

export interface WorkspaceMoveParams {
  workspace_id: string;
  insert_index: number;
}

export interface WorktreeListParams {
  cwd?: string | null;
  workspace_id?: string | null;
}

export interface WorktreeCreateParams {
  label?: string | null;
  path?: string | null;
  branch?: string | null;
  base?: string | null;
  cwd?: string | null;
  focus?: boolean;
  workspace_id?: string | null;
}

export interface WorktreeOpenParams {
  label?: string | null;
  path?: string | null;
  branch?: string | null;
  cwd?: string | null;
  focus?: boolean;
  workspace_id?: string | null;
}

export interface WorktreeRemoveParams {
  workspace_id: string;
  force?: boolean;
}

export interface PluginActionInvokeParams {
  action_id: string;
  plugin_id?: string | null;
  context?: Record<string, unknown> | null;
}

export interface EventsSubscribeParams {
  subscriptions: Array<{ type: string; [key: string]: unknown }>;
}

export interface EventMatch {
  event: string;
  [key: string]: unknown;
}

export interface EventsWaitParams {
  match_event: EventMatch;
  timeout_ms?: number | null;
}

export interface PaneWaitForOutputParams {
  pane_id: string;
  source: "visible" | "recent" | "recent_unwrapped" | "detection";
  match: { match: string };
  lines?: number | null;
  strip_ansi?: boolean;
  timeout_ms?: number | null;
}

export interface LayoutExportParams {
  workspace_id?: string | null;
}

export interface LayoutApplyParams {
  layout: unknown;
  workspace_id?: string | null;
}

export interface LayoutSetSplitRatioParams {
  pane_id: string;
  ratio: number;
}

// ── Concrete helpers (P0) ───────────────────────────────────────────────

export const herdrPing = () => rpcMethod<PongResult>("ping");
export const herdrAgentList = () => rpcMethod("agent.list");
export const herdrAgentStart = (p: AgentStartParams) => rpcMethod("agent.start", p);
export const herdrAgentSend = (p: AgentSendParams) => rpcMethod("agent.send", p);
export const herdrAgentRead = (p: AgentReadParams) => rpcMethod("agent.read", p);
export const herdrAgentStatus = (p: AgentTarget) => rpcMethod("agent.get", p);
export const herdrAgentGet = (p: AgentTarget) => rpcMethod("agent.get", p);
export const herdrAgentRename = (p: AgentRenameParams) => rpcMethod("agent.rename", p);
export const herdrAgentFocus = (p: AgentTarget) => rpcMethod("agent.focus", p);
export const herdrAgentExplain = (p: AgentTarget) => rpcMethod("agent.explain", p);

export const herdrPaneSplit = (p: PaneSplitParams) => rpcMethod("pane.split", p);
export const herdrPaneSendText = (p: PaneSendTextParams) => rpcMethod("pane.send_text", p);
export const herdrPaneSendKeys = (p: PaneSendKeysParams) => rpcMethod("pane.send_keys", p);
export const herdrPaneSendInput = (p: PaneSendInputParams) => rpcMethod("pane.send_input", p);
export const herdrPaneRead = (p: PaneReadParams) => rpcMethod("pane.read", p);
export const herdrPaneList = (p?: PaneListParams) => rpcMethod("pane.list", p ?? {});
export const herdrPaneClose = (p: PaneTarget) => rpcMethod("pane.close", p);
export const herdrPaneGet = (p: PaneTarget) => rpcMethod("pane.get", p);
export const herdrPaneFocus = (p: PaneTarget) => rpcMethod("pane.focus", p);
export const herdrPaneRename = (p: PaneRenameParams) => rpcMethod("pane.rename", p);
export const herdrPaneSwap = (p: PaneSwapParams) => rpcMethod("pane.swap", p);
export const herdrPaneMove = (p: PaneMoveParams) => rpcMethod("pane.move", p);
export const herdrPaneZoom = (p: PaneZoomParams) => rpcMethod("pane.zoom", p);
export const herdrPaneResize = (p: PaneResizeParams) => rpcMethod("pane.resize", p);
export const herdrPaneFocusDirection = (p: PaneFocusDirectionParams) => rpcMethod("pane.focus_direction", p);
export const herdrPaneNeighbor = (p: PaneNeighborParams) => rpcMethod("pane.neighbor", p);
export const herdrPaneEdges = (p: PaneEdgesParams) => rpcMethod("pane.edges", p);
export const herdrPaneCurrent = (p?: PaneCurrentParams) => rpcMethod("pane.current", p ?? {});
export const herdrPaneProcessInfo = (p: PaneProcessInfoParams) => rpcMethod("pane.process_info", p);
export const herdrPaneWaitForOutput = (p: PaneWaitForOutputParams) => rpcMethod("pane.wait_for_output", p);

// ── Concrete helpers (P1) ────────────────────────────────────────────────

export const herdrTabCreate = (p: TabCreateParams) => rpcMethod("tab.create", p);
export const herdrTabClose = (p: TabTarget) => rpcMethod("tab.close", p);
export const herdrTabRename = (p: TabRenameParams) => rpcMethod("tab.rename", p);
export const herdrTabMove = (p: TabMoveParams) => rpcMethod("tab.move", p);
export const herdrTabList = (p?: TabListParams) => rpcMethod("tab.list", p ?? {});
export const herdrTabGet = (p: TabTarget) => rpcMethod("tab.get", p);
export const herdrTabFocus = (p: TabTarget) => rpcMethod("tab.focus", p);

export const herdrWorkspaceCreate = (p: WorkspaceCreateParams) => rpcMethod("workspace.create", p);
export const herdrWorkspaceList = () => rpcMethod("workspace.list");
export const herdrWorkspaceGet = (p: WorkspaceTarget) => rpcMethod("workspace.get", p);
export const herdrWorkspaceFocus = (p: WorkspaceTarget) => rpcMethod("workspace.focus", p);
export const herdrWorkspaceRename = (p: WorkspaceRenameParams) => rpcMethod("workspace.rename", p);
export const herdrWorkspaceMove = (p: WorkspaceMoveParams) => rpcMethod("workspace.move", p);
export const herdrWorkspaceClose = (p: WorkspaceTarget) => rpcMethod("workspace.close", p);

export const herdrPluginList = () => rpcMethod("plugin.list");
export const herdrPluginActionInvoke = (p: PluginActionInvokeParams) => rpcMethod("plugin.action.invoke", p);
export const herdrPluginLink = (p: { plugin_id: string }) => rpcMethod("plugin.link", p);
export const herdrPluginUnlink = (p: { plugin_id: string }) => rpcMethod("plugin.unlink", p);

export const herdrWorktreeList = (p?: WorktreeListParams) => rpcMethod("worktree.list", p ?? {});
export const herdrWorktreeCreate = (p: WorktreeCreateParams) => rpcMethod("worktree.create", p);
export const herdrWorktreeOpen = (p: WorktreeOpenParams) => rpcMethod("worktree.open", p);
export const herdrWorktreeRemove = (p: WorktreeRemoveParams) => rpcMethod("worktree.remove", p);

export const herdrSessionSnapshot = () => rpcMethod("session.snapshot");
export const herdrServerStop = () => rpcMethod("server.stop");
export const herdrServerReloadConfig = () => rpcMethod("server.reload_config");
export const herdrServerAgentManifests = () => rpcMethod("server.agent_manifests");
export const herdrServerReloadAgentManifests = () => rpcMethod("server.reload_agent_manifests");

export const herdrNotificationShow = (p: { title: string; body?: string | null; position?: string | null; sound?: string }) =>
  rpcMethod("notification.show", p);

export const herdrEventsSubscribe = (p: EventsSubscribeParams) => rpcMethod("events.subscribe", p);
export const herdrEventsWait = (p: EventsWaitParams) => rpcMethod("events.wait", p);

export const herdrLayoutExport = (p?: LayoutExportParams) => rpcMethod("layout.export", p ?? {});
export const herdrLayoutApply = (p: LayoutApplyParams) => rpcMethod("layout.apply", p);
export const herdrLayoutSetSplitRatio = (p: LayoutSetSplitRatioParams) => rpcMethod("layout.set_split_ratio", p);