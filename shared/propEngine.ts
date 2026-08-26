export type GameLog = {
  week: number;
  value: number;
  opponent: string;
  date?: string;
};

export type MismatchInputs = {
  opportunityPercentile: number;
  vulnerabilityPercentile: number;
  playerHistory: number[];
  bookLine: number;
  opportunityGames: number;
  defenseGames: number;
  lookbackWeeks: number;
};

export type MismatchResult = {
  mismatchIndex: number;
  bookImpliedPercentile: number;
  modelPercentile: number;
  lineDelta: number;
  projection: number;
  hitRate: number;
  confidence: number;
  dataQuality: "complete" | "insufficient_history" | "missing_matchup";
};

export function percentileRank(values: number[], value: number) {
  if (!values.length) return 0;
  return (values.filter((item) => item <= value).length / values.length) * 100;
}

export function calculateMismatchIndex(opportunityPercentile: number, vulnerabilityPercentile: number) {
  return opportunityPercentile + vulnerabilityPercentile - 100;
}

export function linePercentile(playerHistory: number[], bookLine: number) {
  if (!playerHistory.length) return 0;
  return (playerHistory.filter((value) => value < bookLine).length / playerHistory.length) * 100;
}

export function calculateMismatch(inputs: MismatchInputs): MismatchResult {
  const mismatchIndex = calculateMismatchIndex(
    inputs.opportunityPercentile,
    inputs.vulnerabilityPercentile,
  );
  const bookImpliedPercentile = linePercentile(inputs.playerHistory, inputs.bookLine);
  const modelPercentile = Math.max(0, Math.min(100, 50 + mismatchIndex / 2));
  const lineDelta = modelPercentile - bookImpliedPercentile;
  const opportunityStrength = inputs.opportunityPercentile / 100;
  const vulnerabilityStrength = inputs.vulnerabilityPercentile / 100;
  const baseline = inputs.playerHistory.length
    ? inputs.playerHistory.reduce((sum, value) => sum + value, 0) / inputs.playerHistory.length
    : inputs.bookLine;
  const projection = Math.max(0, baseline * (0.78 + opportunityStrength * 0.12 + vulnerabilityStrength * 0.12));
  const hitRate = inputs.playerHistory.length
    ? (inputs.playerHistory.filter((value) => value > inputs.bookLine).length / inputs.playerHistory.length) * 100
    : 0;
  const sampleRatio = Math.min(inputs.opportunityGames, inputs.defenseGames) / Math.max(inputs.lookbackWeeks, 1);
  const confidence = Math.round(Math.max(0, Math.min(100, (Math.abs(mismatchIndex) * 0.6) + (sampleRatio * 40))));
  const dataQuality = inputs.opportunityGames < 3 || inputs.defenseGames < 3
    ? "insufficient_history"
    : "complete";

  return {
    mismatchIndex,
    bookImpliedPercentile,
    modelPercentile,
    lineDelta,
    projection,
    hitRate,
    confidence,
    dataQuality,
  };
}

export function recommendationExplanation({
  playerName,
  marketLabel,
  opportunityPercentile,
  vulnerabilityPercentile,
  lineDelta,
  opportunityValue,
  allowedValue,
}: {
  playerName: string;
  marketLabel: string;
  opportunityPercentile: number;
  vulnerabilityPercentile: number;
  lineDelta: number;
  opportunityValue: number;
  allowedValue: number;
}) {
  const edgeDirection = lineDelta >= 0 ? "above" : "below";
  return `${playerName} profiles well for ${marketLabel}: recent opportunity is in the ${Math.round(opportunityPercentile)}th percentile, while the opponent is in the ${Math.round(vulnerabilityPercentile)}th percentile for ${marketLabel} allowed. The model projects ${Math.abs(lineDelta).toFixed(1)} percentile points ${edgeDirection} the market line, informed by ${opportunityValue.toFixed(1)} recent volume and ${allowedValue.toFixed(1)} allowed by the matchup.`;
}
