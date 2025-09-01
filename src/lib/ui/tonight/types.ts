export type CloudTriple = { low: number; mid: number; high: number };

export type TimelinePoint = {
  ts: string;
  potential?: number;   // 0..10
  visibility?: number;  // 0..10
  breakdown?: {
    visibility?: Array<{ code: string; params: any }>;
  };
  clouds?: Partial<CloudTriple>;
};

export type Dims = {
  width: number;
  height: number;
  pad: { l: number; r: number; t: number; b: number };
};
