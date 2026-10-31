export const FEATURE_GROUPS={base:52+52+52+4+5+16+2,tactical:9+10+9+2+3+5+4+4,planning:4+4+4,trumpControl:4} as const;
export const FEATURE_COUNT=Object.values(FEATURE_GROUPS).reduce((a,b)=>a+b,0);
export const FEATURE_SCHEMA_VERSION='bund-rung-observation-v1';
export const ARCHITECTURE_VERSION='dueling-layernorm-v1';
