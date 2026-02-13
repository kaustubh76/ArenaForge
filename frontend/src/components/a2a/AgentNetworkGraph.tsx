import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Swords, GitCompareArrows } from 'lucide-react';
import { getEloTier } from '@/constants/ui';
import { useRealtimeStore } from '@/stores/realtimeStore';

// --- Types ---

interface DiscoveredAgent {
  address: string;
  discoveredAt: number;
  fromTournament: number;
  matchesPlayed: number;
  elo: number;
}

interface AgentRelationship {
  agent1: string;
  agent2: string;
  matchCount: number;
  agent1Wins: number;
  agent2Wins: number;
  isRival: boolean;
  isAlly: boolean;
  lastInteraction: number;
}

interface GraphNode {
  id: string;
  label: string;
  elo: number;
  matchesPlayed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  matchCount: number;
  isRival: boolean;
  isAlly: boolean;
}

interface EdgePulse {
  source: string;
  target: string;
  progress: number; // 0-1
  startTime: number;
}

interface NodePopup {
  nodeId: string;
  x: number;
  y: number;
}

// --- Constants ---

const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

const TIER_COLORS: Record<string, string> = {
  Bronze: '#d97706',
  Silver: '#9ca3af',
  Gold: '#eab308',
  Diamond: '#22d3ee',
  Master: '#a855f7',
};

const ALLY_COLOR = '#00ff88';
const RIVAL_COLOR = '#ff4466';
const NEUTRAL_COLOR = '#555555';
const OUR_NODE_COLOR = '#00ffff';
const BG_COLOR = '#0a0a0f';
const GRID_COLOR = '#1a1a2e';

// Force simulation constants
const CENTER_GRAVITY = 0.01;
const REPULSION_STRENGTH = 3000;
const SPRING_STRENGTH = 0.005;
const SPRING_LENGTH = 160;
const DAMPING = 0.92;
const MIN_VELOCITY = 0.01;

// --- Hooks ---

function useNetworkGraphData() {
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [relationships, setRelationships] = useState<AgentRelationship[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{
              discoveredAgents { address discoveredAt fromTournament matchesPlayed elo }
              allRelationships { agent1 agent2 matchCount agent1Wins agent2Wins isRival isAlly lastInteraction }
            }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data) {
          setAgents(json.data.discoveredAgents || []);
          setRelationships(json.data.allRelationships || []);
        }
      } catch { /* silent */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return { agents, relationships };
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// --- Force Simulation ---

function initNodes(agents: DiscoveredAgent[], width: number, height: number): GraphNode[] {
  return agents.map((agent, i) => {
    const angle = (2 * Math.PI * i) / Math.max(agents.length, 1);
    const spread = Math.min(width, height) * 0.3;
    const radius = Math.max(18, Math.min(40, 10 + Math.log(agent.elo) * 3.5));
    return {
      id: agent.address,
      label: shortAddr(agent.address),
      elo: agent.elo,
      matchesPlayed: agent.matchesPlayed,
      x: width / 2 + Math.cos(angle) * spread + (Math.random() - 0.5) * 40,
      y: height / 2 + Math.sin(angle) * spread + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      radius,
      pinned: false,
    };
  });
}

function initEdges(relationships: AgentRelationship[]): GraphEdge[] {
  return relationships.map((r) => ({
    source: r.agent1,
    target: r.agent2,
    matchCount: r.matchCount,
    isRival: r.isRival,
    isAlly: r.isAlly,
  }));
}

function simulateForces(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): void {
  const cx = width / 2;
  const cy = height / 2;

  // Center gravity
  for (const node of nodes) {
    if (node.pinned) continue;
    node.vx += (cx - node.x) * CENTER_GRAVITY;
    node.vy += (cy - node.y) * CENTER_GRAVITY;
  }

  // Node repulsion (Coulomb)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = REPULSION_STRENGTH / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
      if (!b.pinned) { b.vx += fx; b.vy += fy; }
    }
  }

  // Edge springs (Hooke)
  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));
  for (const edge of edges) {
    const a = nodeMap.get(edge.source.toLowerCase());
    const b = nodeMap.get(edge.target.toLowerCase());
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  // Apply velocity + damping + bounds
  for (const node of nodes) {
    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    if (Math.abs(node.vx) < MIN_VELOCITY) node.vx = 0;
    if (Math.abs(node.vy) < MIN_VELOCITY) node.vy = 0;
    node.x += node.vx;
    node.y += node.vy;
    // Keep in bounds
    node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
    node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
  }
}

// --- Canvas Rendering ---

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  pulses: EdgePulse[],
  hoveredNode: string | null,
  width: number,
  height: number,
  transform: { scale: number; panX: number; panY: number },
  time: number,
) {
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  // Dot grid
  ctx.fillStyle = GRID_COLOR;
  const gridSpacing = 30;
  for (let x = gridSpacing; x < width; x += gridSpacing) {
    for (let y = gridSpacing; y < height; y += gridSpacing) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  ctx.save();
  ctx.translate(transform.panX, transform.panY);
  ctx.scale(transform.scale, transform.scale);

  const nodeMap = new Map(nodes.map((n) => [n.id.toLowerCase(), n]));

  // Draw edges
  for (const edge of edges) {
    const a = nodeMap.get(edge.source.toLowerCase());
    const b = nodeMap.get(edge.target.toLowerCase());
    if (!a || !b) continue;

    const isHighlighted =
      hoveredNode &&
      (edge.source.toLowerCase() === hoveredNode.toLowerCase() ||
        edge.target.toLowerCase() === hoveredNode.toLowerCase());

    ctx.save();
    if (edge.isAlly) {
      ctx.strokeStyle = ALLY_COLOR;
      ctx.shadowColor = ALLY_COLOR;
      ctx.shadowBlur = isHighlighted ? 10 : 4;
      ctx.setLineDash([]);
    } else if (edge.isRival) {
      ctx.strokeStyle = RIVAL_COLOR;
      ctx.shadowColor = RIVAL_COLOR;
      ctx.shadowBlur = isHighlighted ? 10 : 4;
      ctx.setLineDash([8, 6]);
    } else {
      ctx.strokeStyle = NEUTRAL_COLOR;
      ctx.shadowBlur = 0;
      ctx.setLineDash([3, 3]);
    }
    ctx.lineWidth = Math.min(1 + edge.matchCount * 0.5, 4);
    ctx.globalAlpha = isHighlighted ? 1 : (hoveredNode ? 0.2 : 0.6);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  // Draw edge pulses
  for (const pulse of pulses) {
    const a = nodeMap.get(pulse.source.toLowerCase());
    const b = nodeMap.get(pulse.target.toLowerCase());
    if (!a || !b) continue;

    const px = a.x + (b.x - a.x) * pulse.progress;
    const py = a.y + (b.y - a.y) * pulse.progress;
    const pulseRadius = 6 + Math.sin(time * 10) * 2;

    ctx.save();
    ctx.fillStyle = OUR_NODE_COLOR;
    ctx.shadowColor = OUR_NODE_COLOR;
    ctx.shadowBlur = 15;
    ctx.globalAlpha = 1 - pulse.progress * 0.3;
    ctx.beginPath();
    ctx.arc(px, py, pulseRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw nodes
  for (const node of nodes) {
    const tier = getEloTier(node.elo);
    const color = TIER_COLORS[tier.label] || '#888888';
    const isHovered = hoveredNode?.toLowerCase() === node.id.toLowerCase();
    const isConnected =
      hoveredNode &&
      edges.some(
        (e) =>
          (e.source.toLowerCase() === hoveredNode.toLowerCase() &&
            e.target.toLowerCase() === node.id.toLowerCase()) ||
          (e.target.toLowerCase() === hoveredNode.toLowerCase() &&
            e.source.toLowerCase() === node.id.toLowerCase())
      );
    const dimmed = hoveredNode && !isHovered && !isConnected;

    ctx.save();
    ctx.globalAlpha = dimmed ? 0.25 : 1;

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = isHovered ? 20 : 10;

    // Node circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner darker fill
    ctx.shadowBlur = 0;
    ctx.fillStyle = BG_COLOR;
    ctx.globalAlpha = dimmed ? 0.15 : 0.6;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius - 3, 0, Math.PI * 2);
    ctx.fill();

    // ELO text
    ctx.globalAlpha = dimmed ? 0.25 : 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(9, node.radius * 0.45)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(node.elo), node.x, node.y);

    // Border ring
    ctx.strokeStyle = color;
    ctx.lineWidth = isHovered ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Label below
    ctx.fillStyle = dimmed ? '#333' : '#aaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(node.label, node.x, node.y + node.radius + 4);

    // Tier label
    ctx.fillStyle = dimmed ? '#222' : color;
    ctx.font = '8px monospace';
    ctx.fillText(tier.label.toUpperCase(), node.x, node.y + node.radius + 16);

    ctx.restore();
  }

  ctx.restore();

  // Legend
  drawLegend(ctx, width);
}

function drawLegend(ctx: CanvasRenderingContext2D, width: number) {
  const x = width - 140;
  const y = 16;

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#111118';
  ctx.fillRect(x - 8, y - 4, 136, 64);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 8, y - 4, 136, 64);
  ctx.globalAlpha = 1;

  ctx.font = '9px monospace';
  // Ally
  ctx.fillStyle = ALLY_COLOR;
  ctx.fillRect(x, y + 4, 20, 2);
  ctx.fillText('ALLY', x + 28, y + 8);

  // Rival
  ctx.fillStyle = RIVAL_COLOR;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = RIVAL_COLOR;
  ctx.beginPath();
  ctx.moveTo(x, y + 22);
  ctx.lineTo(x + 20, y + 22);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('RIVAL', x + 28, y + 26);

  // Neutral
  ctx.fillStyle = NEUTRAL_COLOR;
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = NEUTRAL_COLOR;
  ctx.beginPath();
  ctx.moveTo(x, y + 40);
  ctx.lineTo(x + 20, y + 40);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('NEUTRAL', x + 28, y + 44);

  ctx.restore();
}

// --- Component ---

interface AgentNetworkGraphProps {
  filter: 'all' | 'rivals' | 'allies';
  minElo: number;
  onResetLayout: number; // increment to trigger reset
}

export function AgentNetworkGraph({ filter, minElo, onResetLayout }: AgentNetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const pulsesRef = useRef<EdgePulse[]>([]);
  const animFrameRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [popup, setPopup] = useState<NodePopup | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const transformRef = useRef({ scale: 1, panX: 0, panY: 0 });
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number; isPanning: boolean; startX: number; startY: number }>({
    nodeId: null, offsetX: 0, offsetY: 0, isPanning: false, startX: 0, startY: 0,
  });

  const { agents, relationships } = useNetworkGraphData();

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: 500,
        });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Build graph data when agents/relationships change
  useEffect(() => {
    if (agents.length === 0) return;

    // Filter agents
    const filteredAgents = agents.filter((a) => a.elo >= minElo);

    // Filter relationships
    let filteredRels = relationships;
    if (filter === 'rivals') filteredRels = relationships.filter((r) => r.isRival);
    else if (filter === 'allies') filteredRels = relationships.filter((r) => r.isAlly);

    // Only keep relationships where both agents pass the ELO filter
    const agentSet = new Set(filteredAgents.map((a) => a.address.toLowerCase()));
    filteredRels = filteredRels.filter(
      (r) => agentSet.has(r.agent1.toLowerCase()) && agentSet.has(r.agent2.toLowerCase())
    );

    // Preserve positions for existing nodes
    const existingPositions = new Map(
      nodesRef.current.map((n) => [n.id.toLowerCase(), { x: n.x, y: n.y, pinned: n.pinned }])
    );

    const newNodes = initNodes(filteredAgents, dimensions.width, dimensions.height);
    for (const node of newNodes) {
      const existing = existingPositions.get(node.id.toLowerCase());
      if (existing) {
        node.x = existing.x;
        node.y = existing.y;
        node.pinned = existing.pinned;
      }
    }

    nodesRef.current = newNodes;
    edgesRef.current = initEdges(filteredRels);
  }, [agents, relationships, filter, minElo, dimensions.width, dimensions.height]);

  // Reset layout trigger
  useEffect(() => {
    if (onResetLayout === 0) return;
    const newNodes = initNodes(
      agents.filter((a) => a.elo >= minElo),
      dimensions.width,
      dimensions.height
    );
    nodesRef.current = newNodes;
  }, [onResetLayout]);

  // Real-time challenge pulse animation
  const lastEventCountRef = useRef(0);
  useEffect(() => {
    const unsub = useRealtimeStore.subscribe((state) => {
      const events = state.recentEvents;
      if (events.length > lastEventCountRef.current) {
        // Check new events
        for (let i = 0; i < events.length - lastEventCountRef.current; i++) {
          const ev = events[i]; // newest first
          if (ev?.type === 'a2a:challenge') {
            const data = ev.data as { challenger: string; challenged: string };
            pulsesRef.current.push({
              source: data.challenger,
              target: data.challenged,
              progress: 0,
              startTime: performance.now(),
            });
          }
        }
      }
      lastEventCountRef.current = events.length;
    });
    return unsub;
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    const animate = () => {
      if (!running) return;

      simulateForces(nodesRef.current, edgesRef.current, dimensions.width, dimensions.height);

      // Update pulses
      const now = performance.now();
      pulsesRef.current = pulsesRef.current
        .map((p) => ({ ...p, progress: (now - p.startTime) / 2000 }))
        .filter((p) => p.progress < 1);

      drawGraph(
        ctx,
        nodesRef.current,
        edgesRef.current,
        pulsesRef.current,
        hoveredNode,
        dimensions.width,
        dimensions.height,
        transformRef.current,
        now / 1000,
      );

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [dimensions, hoveredNode]);

  // Hit test
  const hitTest = useCallback((clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const t = transformRef.current;
    const mx = (clientX - rect.left - t.panX) / t.scale;
    const my = (clientY - rect.top - t.panY) / t.scale;

    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i];
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        return node;
      }
    }
    return null;
  }, []);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.nodeId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const t = transformRef.current;
      const mx = (e.clientX - rect.left - t.panX) / t.scale;
      const my = (e.clientY - rect.top - t.panY) / t.scale;
      const node = nodesRef.current.find((n) => n.id === drag.nodeId);
      if (node) {
        node.x = mx - drag.offsetX;
        node.y = my - drag.offsetY;
        node.pinned = true;
      }
      return;
    }

    if (drag.isPanning) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      transformRef.current.panX += dx;
      transformRef.current.panY += dy;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      return;
    }

    const hit = hitTest(e.clientX, e.clientY);
    setHoveredNode(hit?.id || null);
  }, [hitTest]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const t = transformRef.current;
      const mx = (e.clientX - rect.left - t.panX) / t.scale;
      const my = (e.clientY - rect.top - t.panY) / t.scale;
      dragRef.current = {
        nodeId: hit.id,
        offsetX: mx - hit.x,
        offsetY: my - hit.y,
        isPanning: false,
        startX: e.clientX,
        startY: e.clientY,
      };
      setPopup(null);
    } else {
      dragRef.current = {
        nodeId: null,
        offsetX: 0,
        offsetY: 0,
        isPanning: true,
        startX: e.clientX,
        startY: e.clientY,
      };
      setPopup(null);
    }
  }, [hitTest]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.nodeId) {
      // If barely moved, treat as click → show popup
      const moved = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY);
      if (moved < 5) {
        const node = nodesRef.current.find((n) => n.id === drag.nodeId);
        if (node) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const t = transformRef.current;
            setPopup({
              nodeId: node.id,
              x: node.x * t.scale + t.panX + rect.left,
              y: node.y * t.scale + t.panY + rect.top,
            });
          }
        }
      }
    }
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0, isPanning: false, startX: 0, startY: 0 };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = transformRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(3, t.scale * delta));
    // Zoom toward cursor
    t.panX = mx - (mx - t.panX) * (newScale / t.scale);
    t.panY = my - (my - t.panY) * (newScale / t.scale);
    t.scale = newScale;
  }, []);

  const popupNode = popup ? nodesRef.current.find((n) => n.id === popup.nodeId) : null;
  // Find a connected neighbor for H2H link
  const popupNeighbor = popupNode
    ? edgesRef.current
        .filter((e) => e.source === popupNode.id || e.target === popupNode.id)
        .map((e) => (e.source === popupNode.id ? e.target : e.source))[0] ?? null
    : null;

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="rounded-lg border border-white/[0.06] cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoveredNode(null);
          dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0, isPanning: false, startX: 0, startY: 0 };
        }}
        onWheel={handleWheel}
      />

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-1">No agents discovered yet</p>
            <p className="text-gray-600 text-xs">Enable the autonomous scheduler to scan on-chain tournaments</p>
          </div>
        </div>
      )}

      {/* Node popup */}
      {popup && popupNode && (
        <div
          className="fixed z-50 arcade-card p-3 min-w-[180px] animate-fade-in"
          style={{
            left: Math.min(popup.x + 10, window.innerWidth - 220),
            top: Math.min(popup.y - 60, window.innerHeight - 160),
          }}
        >
          <p className="text-xs font-mono text-white mb-1">{shortAddr(popupNode.id)}</p>
          <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-2">
            <span>ELO {popupNode.elo}</span>
            <span>{popupNode.matchesPlayed} matches</span>
            <span className="uppercase" style={{ color: TIER_COLORS[getEloTier(popupNode.elo).label] }}>
              {getEloTier(popupNode.elo).label}
            </span>
          </div>
          <div className="flex gap-1">
            <Link
              to={`/agent/${popupNode.id}`}
              className="flex items-center gap-1 px-2 py-1 rounded bg-arcade-cyan/10 text-arcade-cyan text-[10px] hover:bg-arcade-cyan/20 transition-colors"
              onClick={() => setPopup(null)}
            >
              <Eye size={10} /> Profile
            </Link>
            <Link
              to={`/a2a?target=${popupNode.id}`}
              className="flex items-center gap-1 px-2 py-1 rounded bg-arcade-pink/10 text-arcade-pink text-[10px] hover:bg-arcade-pink/20 transition-colors"
              onClick={() => setPopup(null)}
            >
              <Swords size={10} /> Challenge
            </Link>
            {popupNeighbor && (
              <Link
                to={`/h2h/${popupNode.id}/${popupNeighbor}`}
                className="flex items-center gap-1 px-2 py-1 rounded bg-arcade-purple/10 text-arcade-purple text-[10px] hover:bg-arcade-purple/20 transition-colors"
                onClick={() => setPopup(null)}
              >
                <GitCompareArrows size={10} /> H2H
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
