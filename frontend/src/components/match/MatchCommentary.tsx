// AI-generated match commentary display with visual insights

import { useEffect, useState, useRef, useMemo } from "react";
import { MessageSquare, Loader2, Sparkles, TrendingUp, Target, Zap, Shield } from "lucide-react";

interface CommentaryEntry {
  text: string;
  context: string;
  matchId: number;
  generatedAt: number;
  fromCache: boolean;
}

interface MatchCommentaryProps {
  matchId: number;
  isLive?: boolean;
  isComplete: boolean;
}

export function MatchCommentary({
  matchId,
  isComplete,
}: MatchCommentaryProps) {
  const [preMatch, setPreMatch] = useState<CommentaryEntry | null>(null);
  const [postMatch, setPostMatch] = useState<CommentaryEntry | null>(null);
  const [preLoading, setPreLoading] = useState(false);
  const [postLoading, setPostLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const fetchedPre = useRef(false);
  const fetchedPost = useRef(false);

  const gqlUrl =
    import.meta.env.VITE_GRAPHQL_URL || "http://localhost:4000/graphql";

  const fetchCommentary = async (
    context: "PRE_MATCH" | "POST_MATCH"
  ): Promise<CommentaryEntry | null> => {
    try {
      const res = await fetch(gqlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query($matchId: Int!, $context: CommentaryContext!) {
            matchCommentary(matchId: $matchId, context: $context) {
              text context matchId generatedAt fromCache
            }
          }`,
          variables: { matchId, context },
        }),
      });
      const json = await res.json();
      return json?.data?.matchCommentary ?? null;
    } catch {
      return null;
    }
  };

  // Fetch pre-match commentary on mount
  useEffect(() => {
    if (fetchedPre.current || unavailable) return;
    fetchedPre.current = true;
    setPreLoading(true);
    fetchCommentary("PRE_MATCH").then((result) => {
      setPreLoading(false);
      if (result) {
        setPreMatch(result);
      } else {
        // Claude likely disabled — hide the whole section
        setUnavailable(true);
      }
    });
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch post-match commentary when match completes
  useEffect(() => {
    if (!isComplete || fetchedPost.current || unavailable) return;
    fetchedPost.current = true;
    setPostLoading(true);
    fetchCommentary("POST_MATCH").then((result) => {
      setPostLoading(false);
      if (result) setPostMatch(result);
    });
  }, [isComplete, matchId, unavailable]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render anything if Claude is unavailable
  if (unavailable && !preMatch && !postMatch) return null;

  const hasContent = preMatch || postMatch || preLoading || postLoading;
  if (!hasContent) return null;

  return (
    <div className="arcade-card p-4 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-arcade-gold" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
          AI COMMENTARY
        </h3>
        <span
          className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-arcade-gold/10 text-arcade-gold border border-arcade-gold/20 animate-pulse-soft"
          style={{ boxShadow: '0 0 6px rgba(255,215,0,0.15)' }}
        >
          CLAUDE
        </span>
      </div>

      <div className="space-y-4">
        {/* Pre-match */}
        {preLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <Loader2 size={14} className="animate-spin" />
            <span>Generating pre-match analysis...</span>
          </div>
        )}
        {preMatch && (
          <CommentaryBlock
            label="PRE-MATCH"
            text={preMatch.text}
            fromCache={preMatch.fromCache}
            context="PRE_MATCH"
          />
        )}

        {/* Post-match */}
        {postLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <Loader2 size={14} className="animate-spin" />
            <span>Generating post-match analysis...</span>
          </div>
        )}
        {postMatch && (
          <CommentaryBlock
            label="POST-MATCH"
            text={postMatch.text}
            fromCache={postMatch.fromCache}
            context="POST_MATCH"
          />
        )}
      </div>
    </div>
  );
}

function CommentaryBlock({
  label,
  text,
  fromCache,
  context,
}: {
  label: string;
  text: string;
  fromCache: boolean;
  context: string;
}) {
  return (
    <div className="rounded-lg bg-surface-3/50 border border-white/[0.04] p-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={12} className="text-arcade-gold" />
        <span className="text-[10px] font-bold tracking-wider text-arcade-gold">
          {label}
        </span>
        {fromCache && (
          <span className="text-[9px] text-gray-600">(cached)</span>
        )}
      </div>
      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
        {text}
      </p>
      <CommentaryInsights text={text} context={context} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commentary Insights — sentiment meter + extracted stat pills
// ---------------------------------------------------------------------------
const POSITIVE_WORDS = ['dominant', 'strong', 'likely', 'favored', 'advantage', 'excellent', 'impressive', 'commanding', 'superior', 'confident', 'powerful', 'winning'];
const NEGATIVE_WORDS = ['underdog', 'struggle', 'unlikely', 'weak', 'disadvantage', 'difficult', 'deficit', 'inferior', 'losing', 'behind', 'risky', 'vulnerable'];

function CommentaryInsights({ text, context }: { text: string; context: string }) {
  const analysis = useMemo(() => {
    const lower = text.toLowerCase();

    // Sentiment analysis
    let positive = 0;
    let negative = 0;
    POSITIVE_WORDS.forEach(w => { if (lower.includes(w)) positive++; });
    NEGATIVE_WORDS.forEach(w => { if (lower.includes(w)) negative++; });
    const total = positive + negative;
    const sentiment = total > 0 ? (positive - negative) / total : 0; // -1 to +1

    // Extract key stats
    const stats: Array<{ value: string; type: 'pct' | 'elo' | 'count' }> = [];

    // Percentages
    const pctMatches = text.match(/(\d+\.?\d*)\s*%/g);
    if (pctMatches) {
      pctMatches.slice(0, 2).forEach(m => stats.push({ value: m, type: 'pct' }));
    }

    // ELO values
    const eloMatches = text.match(/(\d{3,4})\s*(?:ELO|elo|rating|Elo)/g);
    if (eloMatches) {
      eloMatches.slice(0, 1).forEach(m => stats.push({ value: m, type: 'elo' }));
    }

    // Win/match counts
    const countMatches = text.match(/(\d+)\s*(?:win|loss|match|game|streak|round)/gi);
    if (countMatches && stats.length < 3) {
      countMatches.slice(0, 3 - stats.length).forEach(m => stats.push({ value: m, type: 'count' }));
    }

    return { sentiment, positive, negative, stats: stats.slice(0, 3), hasSentiment: total > 0 };
  }, [text]);

  if (!analysis.hasSentiment && analysis.stats.length === 0) return null;

  // Sentiment bar: 0 = left edge (negative), 0.5 = center (neutral), 1 = right edge (positive)
  const sentimentPct = ((analysis.sentiment + 1) / 2) * 100;
  const sentimentLabel = context === 'PRE_MATCH' ? 'PREDICTION CONFIDENCE' : 'MATCH INTENSITY';

  const statColors = { pct: '#00e5ff', elo: '#b388ff', count: '#ffd740' };
  const statIcons = { pct: Target, elo: Shield, count: Zap };

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.04]">
      {/* Sentiment meter */}
      {analysis.hasSentiment && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] text-gray-600 uppercase tracking-wider">{sentimentLabel}</span>
            <span className="text-[8px] text-gray-500">
              {analysis.sentiment > 0.3 ? 'HIGH' : analysis.sentiment > -0.3 ? 'MODERATE' : 'LOW'}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full overflow-hidden">
            {/* Gradient background: red → gray → green */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, #ff5252, #666 50%, #69f0ae)',
              }}
            />
            {/* Marker dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-surface-0 transition-all duration-500"
              style={{
                left: `calc(${sentimentPct}% - 5px)`,
                boxShadow: `0 0 6px ${analysis.sentiment > 0.3 ? 'rgba(105,240,174,0.5)' : analysis.sentiment < -0.3 ? 'rgba(255,82,82,0.5)' : 'rgba(255,255,255,0.3)'}`,
              }}
            />
          </div>
        </div>
      )}

      {/* Extracted stat pills */}
      {analysis.stats.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <TrendingUp size={10} className="text-gray-600" />
          {analysis.stats.map((s, i) => {
            const Icon = statIcons[s.type];
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-all duration-150 hover:scale-110 cursor-default"
                style={{
                  backgroundColor: `${statColors[s.type]}10`,
                  color: statColors[s.type],
                  border: `1px solid ${statColors[s.type]}30`,
                }}
              >
                <Icon size={8} />
                {s.value}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
