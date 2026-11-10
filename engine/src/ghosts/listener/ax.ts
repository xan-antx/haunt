/*
 * What The Listener hears: the page's Accessibility_Tree as Chromium computes it.
 *
 * `readHeard` calls the Chrome DevTools Protocol method `Accessibility.getFullAXTree` and
 * `buildHeard` turns the raw node list into a `Heard`. `buildHeard` is a pure function of the raw
 * nodes and the caller's input, so it can be tested with canned data.
 *
 * Rules (Requirements 8.2 and 8.3):
 *   - Roles, names, descriptions and values are Chromium's computed values, copied as they are.
 *     This file never computes an accessible name.
 *   - A `Heard` holds only the fields declared below. No screenshots, pixels, coordinates, sizes,
 *     CSS, HTML or DOM handles. The `ref` of a node is opaque text (`ax-<backendDOMNodeId>`).
 *
 * `Accessibility.enable` must have been sent on the CDP session before the first read, so that
 * Chromium keeps the accessibility tree up to date. The Body does that once, right after it
 * creates its session (see `enableAccessibility`). `readHeard` only reads.
 */

export interface HeardNode {
  /** `ax-<backendDOMNodeId>`: opaque, stable while the element exists. */
  ref: string;
  role: string;
  name: string;
  description: string;
  value: string;
  states: {
    focused?: true;
    checked?: boolean | 'mixed';
    expanded?: boolean;
    disabled?: true;
    required?: true;
    invalid?: true;
    modal?: true;
    busy?: true;
  };
  /** Heading level. */
  level?: number;
  /** Number of kept (not ignored) ancestors. */
  depth: number;
}

export interface Heard {
  title: string;
  path: string;
  /** Document order, ignored nodes removed, children kept. */
  nodes: HeardNode[];
  /** Ref of the focused node. */
  focus: string | null;
  /** Nearest dialog or alertdialog that contains the focus. */
  dialog: { ref: string; name: string } | null;
  /** Nearest landmark or region that contains the focus. */
  region: { ref: string; role: string; name: string } | null;
  /** Ref, moved by heading and landmark jumps. */
  readingPosition: string | null;
  /** Live_Announcements since the previous Perception. */
  announcements: string[];
}

/** The state a caller holds between reads and hands in each time. */
export interface HeardInput {
  title: string;
  path: string;
  readingPosition: string | null;
  announcements: string[];
}

/** The parts of a CDP `Accessibility.AXValue` this file reads. */
export interface RawAxValue {
  type: string;
  value?: unknown;
}

export interface RawAxProperty {
  name: string;
  value: RawAxValue;
}

/** The parts of a CDP `Accessibility.AXNode` this file reads. */
export interface RawAxNode {
  nodeId: string;
  ignored?: boolean;
  role?: RawAxValue;
  name?: RawAxValue;
  description?: RawAxValue;
  value?: RawAxValue;
  properties?: RawAxProperty[];
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

/** The one CDP call this file makes. Playwright's `CDPSession` and the engine's `ReadOnlyCdp` both fit. */
export interface AxCdp {
  send(method: 'Accessibility.getFullAXTree'): Promise<{ nodes: RawAxNode[] }>;
}

/**
 * Chromium lists one `InlineTextBox` under each `StaticText`, one per line of text. They repeat the
 * text of their parent, exist only because of line layout, and have no DOM node (so no
 * `backendDOMNodeId`). They are left out like ignored nodes; a screen reader never reads them.
 */
const LAYOUT_FRAGMENT_ROLE = 'InlineTextBox';

/** Roles that make a node a dialog for the "dialog that contains the focus" field. */
const DIALOG_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog']);

/** Landmark roles for the "region that contains the focus" field. */
const REGION_ROLES: ReadonlySet<string> = new Set([
  'banner',
  'main',
  'contentinfo',
  'navigation',
  'region',
  'form',
  'search',
  'complementary',
]);

/**
 * Sends `Accessibility.enable` on a CDP session. Call it once, before the first `readHeard`.
 * It takes a session that allows this write-free setup call; detectors never call it.
 */
export async function enableAccessibility(cdp: { send(method: 'Accessibility.enable'): Promise<unknown> }): Promise<void> {
  await cdp.send('Accessibility.enable');
}

/** Reads the full accessibility tree of the page and builds a `Heard` from it. */
export async function readHeard(cdp: AxCdp, input: HeardInput): Promise<Heard> {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  return buildHeard(nodes, input);
}

function text(v: RawAxValue | undefined): string {
  const value = v?.value;
  return value === undefined || value === null ? '' : String(value);
}

/** `true` and `'true'` are true, `false` and `'false'` are false, anything else is unknown. */
function asBoolean(v: unknown): boolean | undefined {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

function property(node: RawAxNode, name: string): unknown {
  return node.properties?.find((p) => p.name === name)?.value?.value;
}

function statesOf(node: RawAxNode): { states: HeardNode['states']; level?: number } {
  const states: HeardNode['states'] = {};

  if (asBoolean(property(node, 'focused')) === true) states.focused = true;

  const checked = property(node, 'checked');
  if (checked === 'mixed') states.checked = 'mixed';
  else if (asBoolean(checked) !== undefined) states.checked = asBoolean(checked);

  const expanded = asBoolean(property(node, 'expanded'));
  if (expanded !== undefined) states.expanded = expanded;

  if (asBoolean(property(node, 'disabled')) === true) states.disabled = true;
  if (asBoolean(property(node, 'required')) === true) states.required = true;
  if (asBoolean(property(node, 'modal')) === true) states.modal = true;
  if (asBoolean(property(node, 'busy')) === true) states.busy = true;

  // `invalid` is a token: 'true', 'false', 'grammar' or 'spelling'. Anything but 'false' means invalid.
  const invalid = property(node, 'invalid');
  if (invalid !== undefined && invalid !== null && invalid !== false && invalid !== 'false') states.invalid = true;

  const rawLevel = property(node, 'level');
  const level = typeof rawLevel === 'number' ? rawLevel : typeof rawLevel === 'string' ? Number(rawLevel) : NaN;
  return Number.isInteger(level) && level > 0 ? { states, level } : { states };
}

/**
 * Builds a `Heard` from the raw nodes of `Accessibility.getFullAXTree`. Pure: the same nodes and
 * input always give the same result.
 */
export function buildHeard(raw: readonly RawAxNode[], input: HeardInput): Heard {
  const byId = new Map<string, RawAxNode>();
  for (const node of raw) byId.set(node.nodeId, node);

  // Children in tree order. `childIds` gives the order when present; children that only name their
  // parent are appended in the order they arrive.
  const derived = new Map<string, string[]>();
  const roots: string[] = [];
  for (const node of raw) {
    if (node.parentId !== undefined && byId.has(node.parentId)) {
      const list = derived.get(node.parentId) ?? [];
      list.push(node.nodeId);
      derived.set(node.parentId, list);
    } else {
      roots.push(node.nodeId);
    }
  }
  const childrenOf = (node: RawAxNode): string[] => {
    const listed = (node.childIds ?? []).filter((id) => byId.has(id));
    const seen = new Set(listed);
    return [...listed, ...(derived.get(node.nodeId) ?? []).filter((id) => !seen.has(id))];
  };

  // Walk the tree in document order. A node's depth counts only the kept (not ignored) ancestors,
  // so an ignored wrapper disappears and its children move up one level.
  const nodes: HeardNode[] = [];
  const keptRefByNodeId = new Map<string, string>();
  const usedRefs = new Set<string>();
  const visited = new Set<string>();

  const walk = (nodeId: string, depth: number): void => {
    const node = byId.get(nodeId);
    if (!node || visited.has(nodeId)) return;
    visited.add(nodeId);

    let childDepth = depth;
    if (node.ignored !== true && text(node.role) !== LAYOUT_FRAGMENT_ROLE) {
      let ref = node.backendDOMNodeId !== undefined ? `ax-${node.backendDOMNodeId}` : `ax-n${node.nodeId}`;
      for (let n = 2; usedRefs.has(ref); n++) ref = `${ref.replace(/~\d+$/, '')}~${n}`;
      usedRefs.add(ref);
      keptRefByNodeId.set(nodeId, ref);

      const { states, level } = statesOf(node);
      const heardNode: HeardNode = {
        ref,
        role: text(node.role),
        name: text(node.name),
        description: text(node.description),
        value: text(node.value),
        states,
        depth,
      };
      if (level !== undefined) heardNode.level = level;
      nodes.push(heardNode);
      childDepth = depth + 1;
    }
    for (const childId of childrenOf(node)) walk(childId, childDepth);
  };
  for (const rootId of roots) walk(rootId, 0);

  // The focused node: the last focused node in document order (the innermost, when frames nest).
  let focusNodeId: string | null = null;
  for (const [nodeId] of keptRefByNodeId) {
    const node = byId.get(nodeId);
    if (node && asBoolean(property(node, 'focused')) === true) focusNodeId = nodeId;
  }

  // Nearest dialog and nearest landmark, starting at the focused node and walking up through its parents.
  let dialog: Heard['dialog'] = null;
  let region: Heard['region'] = null;
  if (focusNodeId !== null) {
    const guard = new Set<string>();
    let current: RawAxNode | undefined = byId.get(focusNodeId);
    while (current && !guard.has(current.nodeId) && (dialog === null || region === null)) {
      guard.add(current.nodeId);
      const ref = keptRefByNodeId.get(current.nodeId);
      const role = text(current.role);
      if (ref !== undefined) {
        if (dialog === null && DIALOG_ROLES.has(role)) dialog = { ref, name: text(current.name) };
        if (region === null && REGION_ROLES.has(role)) region = { ref, role, name: text(current.name) };
      }
      current = current.parentId !== undefined ? byId.get(current.parentId) : undefined;
    }
  }

  return {
    title: input.title,
    path: input.path,
    nodes,
    focus: focusNodeId !== null ? (keptRefByNodeId.get(focusNodeId) ?? null) : null,
    dialog,
    region,
    readingPosition: input.readingPosition,
    announcements: [...input.announcements],
  };
}
