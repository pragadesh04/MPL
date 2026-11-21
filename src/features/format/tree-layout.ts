import type { TournamentTree } from '@/lib/rules/buildTournamentTree';

/**
 * Pixel layout for the Tree view (§7.10a): group cards on the left → knockout rounds → final →
 * champion, with connector lines. Pure, so it is unit-tested and the PNG export matches the screen.
 *
 * Round r (1-based) node i sits centred at y = (i + ½) · 2^(r−1) · ROW, so every node lands halfway
 * between its two feeders. The 3rd-place match goes under the final.
 */
export const TREE = {
  nodeW: 220,
  nodeH: 76,
  row: 96,
  colGap: 56,
  groupW: 230,
  groupGap: 16,
  groupHeader: 34,
  groupRow: 26,
  groupPad: 10,
  championW: 200,
  pad: 16,
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GroupBox extends Box {
  groupId: string;
  /** Centre y of each standings row (position 1 first). */
  rowY: number[];
}

export interface NodeBox extends Box {
  matchId: string;
  round: number;
}

export interface Connector {
  /** Feeder match id (or `group:<groupId>:<pos>` for a group position). */
  from: string;
  to: string;
  /** 'A' / 'B' slot of `to`. */
  slot: 'A' | 'B';
  d: string;
}

export interface TreeLayout {
  width: number;
  height: number;
  groups: GroupBox[];
  nodes: NodeBox[];
  connectors: Connector[];
  champion: Box | null;
}

/** Centre y of slot A / B inside a node. */
export function slotY(node: Box, slot: 'A' | 'B'): number {
  return node.y + (slot === 'A' ? node.h * 0.3 : node.h * 0.72);
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const mid = x1 + (x2 - x1) / 2;
  return `M${x1},${y1} H${mid} V${y2} H${x2}`;
}

export function layoutTree(tree: TournamentTree, opts: { showGroups: boolean }): TreeLayout {
  const { pad } = TREE;
  const showGroups = opts.showGroups && tree.groups.length > 0;

  // Group cards, stacked.
  const groups: GroupBox[] = [];
  let gy = pad;
  if (showGroups) {
    for (const g of tree.groups) {
      const rows = Math.max(g.teamIds.length, g.standings.length);
      const h = TREE.groupHeader + rows * TREE.groupRow + TREE.groupPad;
      groups.push({
        groupId: g.groupId,
        x: pad,
        y: gy,
        w: TREE.groupW,
        h,
        rowY: Array.from(
          { length: rows },
          (_, i) => gy + TREE.groupHeader + i * TREE.groupRow + TREE.groupRow / 2,
        ),
      });
      gy += h + TREE.groupGap;
    }
  }
  const groupsRight = showGroups ? pad + TREE.groupW + TREE.colGap * 1.5 : pad;

  // Knockout rounds.
  const nodes: NodeBox[] = [];
  const byId = new Map<string, NodeBox>();
  const colX = (round: number): number => groupsRight + (round - 1) * (TREE.nodeW + TREE.colGap);
  for (const r of tree.rounds) {
    const span = 2 ** (r.round - 1) * TREE.row;
    r.nodes.forEach((n, i) => {
      const cy = pad + (i + 0.5) * span;
      const box: NodeBox = {
        matchId: n.matchId,
        round: r.round,
        x: colX(r.round),
        y: cy - TREE.nodeH / 2,
        w: TREE.nodeW,
        h: TREE.nodeH,
      };
      nodes.push(box);
      byId.set(n.matchId, box);
    });
  }
  const lastRound = tree.rounds.length;
  const firstCount = tree.rounds[0]?.nodes.length ?? 0;
  let bracketBottom = pad + firstCount * TREE.row;
  if (tree.thirdPlace && lastRound > 0) {
    const finalBox = byId.get(tree.rounds[lastRound - 1]!.nodes[0]!.matchId)!;
    const box: NodeBox = {
      matchId: tree.thirdPlace.matchId,
      round: lastRound,
      x: finalBox.x,
      y: Math.max(finalBox.y + TREE.nodeH + TREE.row * 0.75, bracketBottom - TREE.nodeH),
      w: TREE.nodeW,
      h: TREE.nodeH,
    };
    nodes.push(box);
    byId.set(box.matchId, box);
    bracketBottom = Math.max(bracketBottom, box.y + box.h + pad);
  }

  // Connectors: knockout feeders, then group positions.
  const connectors: Connector[] = [];
  const allNodes = [
    ...tree.rounds.flatMap((r) => r.nodes),
    ...(tree.thirdPlace ? [tree.thirdPlace] : []),
  ];
  for (const n of allNodes) {
    const to = byId.get(n.matchId)!;
    for (const slot of ['A', 'B'] as const) {
      const source = slot === 'A' ? n.match.sourceA : n.match.sourceB;
      if (!source) continue;
      if (source.type === 'GROUP_POS') {
        if (!showGroups || n.match.isBye) continue;
        const [groupId, pos] = source.ref.split(':');
        const g = groups.find((x) => x.groupId === groupId);
        const y = g?.rowY[Number(pos) - 1];
        if (!g || y === undefined) continue;
        connectors.push({
          from: `group:${groupId}:${pos}`,
          to: n.matchId,
          slot,
          d: curve(g.x + g.w, y, to.x, slotY(to, slot)),
        });
      } else if (source.type === 'WINNER_OF') {
        const from = byId.get(source.ref);
        if (!from) continue;
        connectors.push({
          from: source.ref,
          to: n.matchId,
          slot,
          d: elbow(from.x + from.w, from.y + from.h / 2, to.x, slotY(to, slot)),
        });
      }
      // LOSER_OF (3rd place) has no line: it would cross the whole bracket.
    }
  }

  // Champion card after the final.
  let champion: Box | null = null;
  if (lastRound > 0) {
    const finalBox = byId.get(tree.rounds[lastRound - 1]!.nodes[0]!.matchId)!;
    champion = {
      x: finalBox.x + TREE.nodeW + TREE.colGap,
      y: finalBox.y + TREE.nodeH / 2 - 60,
      w: TREE.championW,
      h: 120,
    };
  }

  const width =
    Math.max(groupsRight, ...nodes.map((n) => n.x + n.w), champion ? champion.x + champion.w : 0) +
    pad;
  const height = Math.max(gy, bracketBottom, champion ? champion.y + champion.h : 0) + pad;
  return { width, height, groups, nodes, connectors, champion };
}
