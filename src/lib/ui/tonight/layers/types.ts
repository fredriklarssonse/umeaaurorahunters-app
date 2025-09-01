// src/lib/ui/tonight/types.ts
export type CloudParams = { low?: number; mid?: number; high?: number };

export type TimelinePoint = {
  ts: string;
  potential?: number;
  visibility?: number;
  breakdown?: {
    clouds?: CloudParams;
    visibility?: Array<{
      code: string;
      params?: {
        low?: number; mid?: number; high?: number;
        elevationDeg?: number; illum?: number; altDeg?: number;
      };
    }>;
  };
};

export type Dims = {
  width: number;
  height: number;
  pad: { l: number; r: number; t: number; b: number };
};
