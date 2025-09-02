// src/lib/ui/tonight/types.ts
export type CloudParams = { low?: number; mid?: number; high?: number };

// src/lib/ui/tonight/layers/types.ts

// ... behåll övriga exporter/oförändrat

export type VisibilityItem = {
  code: string;
  params?: {
    // Clouds
    low?: number;
    mid?: number;
    high?: number;
    total01?: number; // <— NY: normaliserad molnandel 0..1

    // Twilight / Sol
    elevationDeg?: number;
    key?: // <— NY: i18n-nyckel för twilight
      | 'astronomy.twilight.civil'
      | 'astronomy.twilight.nautical'
      | 'astronomy.twilight.astronomical'
      | 'astronomy.twilight.astro_dark';

    // Moon
    illum?: number;
    altDeg?: number;

    // KP
    kp?: number; // <— NY
  };
};

export type TimelinePoint = {
  ts: string;
  breakdown: {
    visibility: VisibilityItem[];
  };
};

// ... behåll ev. Dims och andra typer oförändrat


export type Dims = {
  width: number;
  height: number;
  pad: { l: number; r: number; t: number; b: number };
};

