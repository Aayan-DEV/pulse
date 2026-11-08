declare module "javascript-lp-solver" {
  type Model = {
    optimize: string;
    opType: "min" | "max";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1 | boolean>;
    options?: { timeout?: number; tolerance?: number };
  };
  type Result = { feasible: boolean; result: number; bounded: boolean; isIntegral?: boolean } & Record<string, number | boolean | undefined>;
  const solver: { Solve(model: Model): Result };
  export default solver;
}
