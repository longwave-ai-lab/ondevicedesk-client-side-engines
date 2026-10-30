/**
 * Declarative Calculator Engine
 * Solves reactive financial, freelance, and unit economics formulas client-side,
 * with bidirectional equation solving.
 */

/**
 * Formats a number to fixed decimal precision, normalizing IEEE 754 negative zero (-0) to positive zero (+0).
 */
export function roundTo(val: number, decimals: number): number {
  const n = Number(val.toFixed(decimals));
  return n === 0 ? 0 : n;
}

export interface FormulaVariableDef {
  id: string;
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  isCurrency?: boolean;
  isPercent?: boolean;
}

export interface FormulaMetricDef {
  id: string;
  label: string;
  unit?: string;
  isCurrency?: boolean;
  isPercent?: boolean;
  highlight?: boolean;
}

export interface CalculatorFormula {
  id: string;
  name: string;
  description: string;
  inputs: FormulaVariableDef[];
  outputs: FormulaMetricDef[];
  variables: Record<string, number>;
  compute: (vars: Record<string, number>) => Record<string, number>;
  solvers?: Record<
    string, // targetOutputId
    Record<
      string, // variableToSolve
      (targetVal: number, currentInputs: Record<string, number>) => number
    >
  >;
}

export const SAAS_RUNWAY_FORMULA: CalculatorFormula = {
  id: 'saas_runway',
  name: 'SaaS Runway & Net Burn Calculator',
  description: 'Forecast zero-cash date, monthly burn rate, and required runway capital.',
  inputs: [
    { id: 'cashBalance', label: 'Cash in Bank', defaultValue: 250000, isCurrency: true, step: 1000 },
    { id: 'monthlyRevenue', label: 'Monthly Recurring Revenue (MRR)', defaultValue: 15000, isCurrency: true, step: 500 },
    { id: 'monthlyExpenses', label: 'Monthly Operating Expenses', defaultValue: 35000, isCurrency: true, step: 500 },
    { id: 'revenueGrowthRatePct', label: 'Monthly MRR Growth (%)', defaultValue: 0, isPercent: true, step: 0.5 },
  ],
  outputs: [
    { id: 'runwayMonths', label: 'Runway Remaining', unit: 'Months', highlight: true },
    { id: 'netBurn', label: 'Monthly Net Burn', isCurrency: true },
    { id: 'annualRunRate', label: 'Annual Run Rate (ARR)', isCurrency: true },
    { id: 'zeroCashDateMonths', label: 'Full Runway Months', unit: 'Months' },
    { id: 'grossMarginPct', label: 'Operating Margin', isPercent: true },
  ],
  variables: {
    cashBalance: 250000,
    monthlyRevenue: 15000,
    monthlyExpenses: 35000,
    revenueGrowthRatePct: 0,
  },
  compute: (vars) => {
    const cash = Math.max(0, vars.cashBalance || 0);
    const rev = Math.max(0, vars.monthlyRevenue || 0);
    const exp = Math.max(0, vars.monthlyExpenses || 0);

    const netBurn = Math.max(0, exp - rev);
    const runwayMonths = netBurn > 0 ? cash / netBurn : 999;
    const arr = rev * 12;
    const grossMarginPct = rev > 0 ? ((rev - exp) / rev) * 100 : exp > 0 ? -100 : 0;

    return {
      netBurn: roundTo(netBurn, 2),
      runwayMonths: roundTo(Math.min(999, runwayMonths), 1),
      zeroCashDateMonths: Math.min(999, Math.floor(runwayMonths)),
      annualRunRate: roundTo(arr, 2),
      grossMarginPct: roundTo(grossMarginPct, 1),
    };
  },
  solvers: {
    runwayMonths: {
      // Solve required revenue given target runway: targetRunway = cash / (exp - rev) -> rev = exp - (cash / targetRunway)
      monthlyRevenue: (targetRunway, inputs) => {
        if (targetRunway <= 0) return 0;
        const exp = inputs.monthlyExpenses ?? 0;
        const cash = inputs.cashBalance ?? 0;
        return roundTo(exp - cash / targetRunway, 2);
      },
      // Solve max monthly expenses given target runway: exp = rev + (cash / targetRunway)
      monthlyExpenses: (targetRunway, inputs) => {
        if (targetRunway <= 0) return 0;
        const rev = inputs.monthlyRevenue ?? 0;
        const cash = inputs.cashBalance ?? 0;
        return roundTo(rev + cash / targetRunway, 2);
      },
      // Solve required cash balance given target runway: cash = targetRunway * netBurn
      cashBalance: (targetRunway, inputs) => {
        const netBurn = Math.max(0, (inputs.monthlyExpenses ?? 0) - (inputs.monthlyRevenue ?? 0));
        return roundTo(targetRunway * netBurn, 2);
      },
    },
  },
};

export const ECOMMERCE_MARGIN_FORMULA: CalculatorFormula = {
  id: 'ecommerce_margin',
  name: 'E-Commerce Seller Fee & Profit Margin Calculator',
  description: 'Calculate unit margins, platform commission fees, and required retail price for target margin.',
  inputs: [
    { id: 'retailPrice', label: 'Retail Price ($)', defaultValue: 49.99, isCurrency: true, step: 0.5 },
    { id: 'costOfGoods', label: 'Cost of Goods (COGS)', defaultValue: 15.0, isCurrency: true, step: 0.25 },
    { id: 'platformFeePct', label: 'Platform Fee (%)', defaultValue: 15, isPercent: true, step: 0.1 },
    { id: 'shippingCost', label: 'Fulfillment / Shipping', defaultValue: 4.5, isCurrency: true, step: 0.25 },
    { id: 'advertisingCost', label: 'Ad Spend Per Unit', defaultValue: 5.0, isCurrency: true, step: 0.25 },
    { id: 'unitsSold', label: 'Estimated Units Sold', defaultValue: 100, step: 10 },
  ],
  outputs: [
    { id: 'profitMarginPct', label: 'Net Profit Margin', isPercent: true, highlight: true },
    { id: 'netProfitPerUnit', label: 'Net Profit / Unit', isCurrency: true },
    { id: 'platformFee', label: 'Platform Fee', isCurrency: true },
    { id: 'totalCostPerUnit', label: 'Total Unit Cost', isCurrency: true },
    { id: 'markupPct', label: 'Markup on COGS', isPercent: true },
    { id: 'roiPct', label: 'Return on Investment (ROI)', isPercent: true },
    { id: 'totalProfit', label: 'Total Net Profit', isCurrency: true },
  ],
  variables: {
    retailPrice: 49.99,
    costOfGoods: 15.0,
    platformFeePct: 15.0,
    shippingCost: 4.5,
    advertisingCost: 5.0,
    unitsSold: 100,
  },
  compute: (vars) => {
    const price = Math.max(0, vars.retailPrice || 0);
    const cogs = Math.max(0, vars.costOfGoods || 0);
    const feePct = Math.max(0, vars.platformFeePct || 0);
    const ship = Math.max(0, vars.shippingCost || 0);
    const ad = Math.max(0, vars.advertisingCost || 0);
    const units = Math.max(1, vars.unitsSold || 1);

    const platformFee = price * (feePct / 100);
    const totalCostPerUnit = cogs + platformFee + ship + ad;
    const netProfitPerUnit = price - totalCostPerUnit;
    const profitMarginPct = price > 0 ? (netProfitPerUnit / price) * 100 : 0;
    const markupPct = cogs > 0 ? ((price - cogs) / cogs) * 100 : 0;
    const roiPct = totalCostPerUnit > 0 ? (netProfitPerUnit / totalCostPerUnit) * 100 : 0;
    const totalProfit = netProfitPerUnit * units;

    return {
      platformFee: roundTo(platformFee, 2),
      totalCostPerUnit: roundTo(totalCostPerUnit, 2),
      netProfitPerUnit: roundTo(netProfitPerUnit, 2),
      profitMarginPct: roundTo(profitMarginPct, 1),
      markupPct: roundTo(markupPct, 1),
      roiPct: roundTo(roiPct, 1),
      totalProfit: roundTo(totalProfit, 2),
    };
  },
  solvers: {
    profitMarginPct: {
      // Solve required retail price given target margin %
      // margin = (price * (1 - fee) - fixed) / price = (1 - fee) - fixed/price
      // fixed/price = (1 - fee) - margin
      // price = fixed / (1 - fee - margin)
      retailPrice: (targetMarginPct, inputs) => {
        const cogs = inputs.costOfGoods ?? 0;
        const ship = inputs.shippingCost ?? 0;
        const ad = inputs.advertisingCost ?? 0;
        const feeFraction = (inputs.platformFeePct ?? 0) / 100;
        const marginFraction = targetMarginPct / 100;

        const fixedCosts = cogs + ship + ad;
        const denom = 1.0 - feeFraction - marginFraction;
        if (denom <= 0) return 0; // Impossible margin given platform fees
        return roundTo(fixedCosts / denom, 2);
      },
    },
  },
};

export const FREELANCE_TAX_FORMULA: CalculatorFormula = {
  id: 'freelance_tax',
  name: 'Freelance Net Income & Tax Estimator',
  description: 'Estimate effective take-home pay, self-employment taxes, and required hourly rate.',
  inputs: [
    { id: 'hourlyRate', label: 'Hourly Billable Rate ($)', defaultValue: 75, isCurrency: true, step: 5 },
    { id: 'billableHoursPerWeek', label: 'Billable Hours / Week', defaultValue: 30, step: 1 },
    { id: 'weeksPerYear', label: 'Working Weeks / Year', defaultValue: 48, step: 1 },
    { id: 'annualExpenses', label: 'Annual Business Expenses', defaultValue: 6000, isCurrency: true, step: 500 },
    { id: 'taxRatePct', label: 'Effective Tax Rate (%)', defaultValue: 28, isPercent: true, step: 0.5 },
    { id: 'retirementContribution', label: 'Pre-Tax Retirement (SEP-IRA)', defaultValue: 5000, isCurrency: true, step: 500 },
  ],
  outputs: [
    { id: 'takeHomePay', label: 'Annual Take-Home Pay', isCurrency: true, highlight: true },
    { id: 'monthlyTakeHome', label: 'Monthly Take-Home', isCurrency: true },
    { id: 'grossAnnualIncome', label: 'Gross Annual Billing', isCurrency: true },
    { id: 'taxableIncome', label: 'Taxable Net Income', isCurrency: true },
    { id: 'estimatedTax', label: 'Estimated Tax Total', isCurrency: true },
    { id: 'effectiveHourlyNet', label: 'Effective Net Hourly Rate', isCurrency: true },
  ],
  variables: {
    hourlyRate: 75,
    billableHoursPerWeek: 30,
    weeksPerYear: 48,
    annualExpenses: 6000,
    taxRatePct: 28,
    retirementContribution: 5000,
  },
  compute: (vars) => {
    const rate = Math.max(0, vars.hourlyRate || 0);
    const hours = Math.max(0, vars.billableHoursPerWeek || 0);
    const weeks = Math.max(0, vars.weeksPerYear || 0);
    const exp = Math.max(0, vars.annualExpenses || 0);
    const taxPct = Math.max(0, vars.taxRatePct || 0);
    const ret = Math.max(0, vars.retirementContribution || 0);

    const totalHours = hours * weeks;
    const gross = rate * totalHours;
    const agi = Math.max(0, gross - exp);
    const taxable = Math.max(0, agi - ret);
    const tax = taxable * (taxPct / 100);
    const takeHome = Math.max(0, gross - exp - tax - ret);
    const monthlyTakeHome = takeHome / 12;
    const effectiveHourlyNet = totalHours > 0 ? takeHome / totalHours : 0;

    return {
      grossAnnualIncome: roundTo(gross, 2),
      taxableIncome: roundTo(taxable, 2),
      estimatedTax: roundTo(tax, 2),
      takeHomePay: roundTo(takeHome, 2),
      monthlyTakeHome: roundTo(monthlyTakeHome, 2),
      effectiveHourlyNet: roundTo(effectiveHourlyNet, 2),
    };
  },
  solvers: {
    takeHomePay: {
      // Solve required hourly rate given target take-home pay
      // takeHome = (gross - exp - ret) * (1 - taxPct/100)
      // gross = (takeHome / (1 - taxPct/100)) + exp + ret
      // rate = gross / totalHours
      hourlyRate: (targetTakeHome, inputs) => {
        const hours = inputs.billableHoursPerWeek ?? 30;
        const weeks = inputs.weeksPerYear ?? 48;
        const totalHours = hours * weeks;
        if (totalHours <= 0) return 0;

        const exp = inputs.annualExpenses ?? 0;
        const ret = inputs.retirementContribution ?? 0;
        const taxRate = inputs.taxRatePct ?? 28;
        const taxFactor = 1.0 - taxRate / 100;
        if (taxFactor <= 0) return 0;

        const neededGross = targetTakeHome / taxFactor + exp + ret;
        return roundTo(neededGross / totalHours, 2);
      },
    },
  },
};

export const CAC_LTV_PAYBACK_FORMULA: CalculatorFormula = {
  id: 'cac_ltv_payback',
  name: 'CAC, LTV & Churn Retention Calculator',
  description: 'Calculate Customer Lifetime Value (LTV), LTV:CAC ratio, CAC payback velocity, and Net Dollar Retention.',
  inputs: [
    { id: 'arpuMonthly', label: 'Monthly ARPU ($)', defaultValue: 120, isCurrency: true, step: 5 },
    { id: 'grossMarginPct', label: 'Gross Margin (%)', defaultValue: 80, isPercent: true, step: 1 },
    { id: 'monthlyChurnPct', label: 'Monthly Logo Churn (%)', defaultValue: 3.2, isPercent: true, step: 0.1 },
    { id: 'cacPerCustomer', label: 'Customer Acquisition Cost (CAC)', defaultValue: 600, isCurrency: true, step: 25 },
    { id: 'expansionMonthlyPct', label: 'Monthly Expansion MRR (%)', defaultValue: 1.5, isPercent: true, step: 0.1 },
    { id: 'activeCustomers', label: 'Active Customers', defaultValue: 250, step: 10 },
  ],
  outputs: [
    { id: 'ltvToCacRatio', label: 'LTV : CAC Ratio', unit: 'x', highlight: true },
    { id: 'customerLtv', label: 'Customer Lifetime Value (LTV)', isCurrency: true },
    { id: 'cacPaybackMonths', label: 'CAC Payback Velocity', unit: 'Months' },
    { id: 'netDollarRetentionPct', label: 'Annual Net Retention (NRR)', isPercent: true },
    { id: 'annualRecurringRev', label: 'Total Annual ARR', isCurrency: true },
  ],
  variables: {
    arpuMonthly: 120,
    grossMarginPct: 80,
    monthlyChurnPct: 3.2,
    cacPerCustomer: 600,
    expansionMonthlyPct: 1.5,
    activeCustomers: 250,
  },
  compute: (vars) => {
    const arpu = Math.max(0, vars.arpuMonthly ?? 120);
    const gm = Math.max(0, Math.min(100, vars.grossMarginPct ?? 80)) / 100;
    const churn = Math.max(0.1, vars.monthlyChurnPct ?? 3.2) / 100;
    const cac = Math.max(0, vars.cacPerCustomer ?? 600);
    const expPct = Math.max(0, vars.expansionMonthlyPct ?? 1.5) / 100;
    const cust = Math.max(0, vars.activeCustomers ?? 250);

    const grossContributionMonthly = arpu * gm;
    const ltv = churn > 0 ? grossContributionMonthly / churn : grossContributionMonthly * 120;
    const ltvToCac = cac > 0 ? ltv / cac : 99.9;
    const paybackMonths = grossContributionMonthly > 0 ? cac / grossContributionMonthly : 999;
    const nrrAnnual = Math.pow(1 + expPct - churn, 12) * 100;
    const arr = arpu * cust * 12;

    return {
      ltvToCacRatio: roundTo(ltvToCac, 2),
      customerLtv: roundTo(ltv, 2),
      cacPaybackMonths: roundTo(Math.min(999, paybackMonths), 1),
      netDollarRetentionPct: roundTo(Math.max(0, nrrAnnual), 1),
      annualRecurringRev: roundTo(arr, 2),
    };
  },
  solvers: {
    ltvToCacRatio: {
      // ltvToCac = (arpu * gm / churn) / cac -> arpu = (ltvToCac * cac * churn) / gm
      arpuMonthly: (targetRatio, inputs) => {
        if (targetRatio <= 0) return 0;
        const gm = Math.max(0.01, (inputs.grossMarginPct ?? 80) / 100);
        const churn = Math.max(0.001, (inputs.monthlyChurnPct ?? 3.2) / 100);
        const cac = Math.max(0, inputs.cacPerCustomer ?? 600);
        return roundTo((targetRatio * cac * churn) / gm, 2);
      },
    },
  },
};

export const BREAKEVEN_EBITDA_FORMULA: CalculatorFormula = {
  id: 'breakeven_ebitda',
  name: 'Break-Even Units & Operating EBITDA Calculator',
  description: 'Model contribution margin per unit, exact break-even volume, and operating EBITDA margin.',
  inputs: [
    { id: 'unitPrice', label: 'Selling Price / Unit ($)', defaultValue: 85, isCurrency: true, step: 1 },
    { id: 'variableCostPerUnit', label: 'Variable Cost / Unit ($)', defaultValue: 35, isCurrency: true, step: 1 },
    { id: 'fixedMonthlyOpex', label: 'Fixed Monthly OpEx ($)', defaultValue: 18000, isCurrency: true, step: 500 },
    { id: 'monthlyUnitsSold', label: 'Monthly Volume (Units)', defaultValue: 500, step: 25 },
    { id: 'depreciationAmortization', label: 'Monthly D&A ($)', defaultValue: 1500, isCurrency: true, step: 100 },
  ],
  outputs: [
    { id: 'breakEvenUnits', label: 'Break-Even Volume', unit: 'Units', highlight: true },
    { id: 'operatingEbitda', label: 'Monthly Operating EBITDA', isCurrency: true },
    { id: 'ebitdaMarginPct', label: 'EBITDA Margin', isPercent: true },
    { id: 'contributionMarginPerUnit', label: 'Contribution / Unit', isCurrency: true },
    { id: 'breakEvenRevenue', label: 'Break-Even Revenue', isCurrency: true },
  ],
  variables: {
    unitPrice: 85,
    variableCostPerUnit: 35,
    fixedMonthlyOpex: 18000,
    monthlyUnitsSold: 500,
    depreciationAmortization: 1500,
  },
  compute: (vars) => {
    const price = Math.max(0, vars.unitPrice ?? 85);
    const varCost = Math.max(0, vars.variableCostPerUnit ?? 35);
    const fixedOpex = Math.max(0, vars.fixedMonthlyOpex ?? 18000);
    const units = Math.max(0, vars.monthlyUnitsSold ?? 500);
    const da = Math.max(0, vars.depreciationAmortization ?? 1500);

    const contribution = price - varCost;
    const breakEvenUnits = contribution > 0 ? Math.ceil(fixedOpex / contribution) : 999999;
    const breakEvenRev = breakEvenUnits * price;
    const totalRev = price * units;
    const operatingEbit = contribution * units - fixedOpex;
    const ebitda = operatingEbit + da;
    const ebitdaMargin = totalRev > 0 ? (ebitda / totalRev) * 100 : 0;

    return {
      breakEvenUnits: roundTo(breakEvenUnits, 0),
      operatingEbitda: roundTo(ebitda, 2),
      ebitdaMarginPct: roundTo(ebitdaMargin, 1),
      contributionMarginPerUnit: roundTo(contribution, 2),
      breakEvenRevenue: roundTo(breakEvenRev, 2),
    };
  },
  solvers: {
    breakEvenUnits: {
      // breakEvenUnits = fixedOpex / (price - varCost) -> price = varCost + (fixedOpex / targetUnits)
      unitPrice: (targetUnits, inputs) => {
        if (targetUnits <= 0) return 0;
        const varCost = inputs.variableCostPerUnit ?? 35;
        const fixedOpex = inputs.fixedMonthlyOpex ?? 18000;
        return roundTo(varCost + fixedOpex / targetUnits, 2);
      },
    },
    operatingEbitda: {
      // ebitda = (price - varCost) * units - fixedOpex + da -> units = (ebitda + fixedOpex - da) / (price - varCost)
      monthlyUnitsSold: (targetEbitda, inputs) => {
        const price = inputs.unitPrice ?? 85;
        const varCost = inputs.variableCostPerUnit ?? 35;
        const contrib = price - varCost;
        if (contrib <= 0) return 0;
        const fixedOpex = inputs.fixedMonthlyOpex ?? 18000;
        const da = inputs.depreciationAmortization ?? 1500;
        return Math.max(0, Math.ceil((targetEbitda + fixedOpex - da) / contrib));
      },
    },
  },
};

export const CALCULATOR_FORMULAS: Record<string, CalculatorFormula> = {
  saas_runway: SAAS_RUNWAY_FORMULA,
  ecommerce_margin: ECOMMERCE_MARGIN_FORMULA,
  freelance_tax: FREELANCE_TAX_FORMULA,
  cac_ltv_payback: CAC_LTV_PAYBACK_FORMULA,
  breakeven_ebitda: BREAKEVEN_EBITDA_FORMULA,
};

/**
 * Evaluates a calculator formula with input variables.
 */
export function evaluateFormula(
  formula: CalculatorFormula,
  inputs: Record<string, number>
): Record<string, number> {
  const merged = { ...formula.variables, ...inputs };
  return formula.compute(merged);
}

/**
 * Solves an equation bidirectionally for a target output variable.
 */
export function solveBidirectional(
  formulaId: string,
  targetOutputId: string,
  targetValue: number,
  inputOverrides: Record<string, number>,
  variableToSolve: string
): { solvedValue: number; error?: string } {
  const formula = CALCULATOR_FORMULAS[formulaId];
  if (!formula) {
    return { solvedValue: 0, error: `Formula '${formulaId}' not found.` };
  }

  const mergedInputs = { ...formula.variables, ...inputOverrides };

  // 1. Check if an analytical solver is registered
  const analyticalSolver = formula.solvers?.[targetOutputId]?.[variableToSolve];
  if (analyticalSolver) {
    try {
      const val = analyticalSolver(targetValue, mergedInputs);
      if (isNaN(val) || !isFinite(val)) {
        return { solvedValue: 0, error: 'Calculated solution is non-finite or impossible.' };
      }
      return { solvedValue: val };
    } catch (err: any) {
      return { solvedValue: 0, error: err?.message || String(err) };
    }
  }

  // 2. Numerical Root-Finding (Bisection) Fallback
  let low = 0;
  let high = 10000000;
  const tolerance = 0.01;
  const maxIter = 100;

  // Determine global monotonicity across the search interval
  const valAtLow = formula.compute({ ...mergedInputs, [variableToSolve]: low })[targetOutputId] ?? 0;
  const valAtHigh = formula.compute({ ...mergedInputs, [variableToSolve]: high })[targetOutputId] ?? 0;
  const globalIsIncreasing = valAtHigh > valAtLow;
  const globalIsDecreasing = valAtHigh < valAtLow;

  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (low + high) / 2;
    const testInputs = { ...mergedInputs, [variableToSolve]: mid };
    const res = formula.compute(testInputs);
    const currentVal = res[targetOutputId] ?? 0;
    const diff = currentVal - targetValue;

    if (Math.abs(diff) <= tolerance) {
      return { solvedValue: roundTo(mid, 2) };
    }

    // Adaptive derivative probe step: scales with variable magnitude to exceed toFixed(1) quantization
    const delta = Math.max(1.0, Math.abs(mid) * 0.01);
    const probeInputs = { ...mergedInputs, [variableToSolve]: mid + delta };
    const probeVal = formula.compute(probeInputs)[targetOutputId] ?? 0;

    let isIncreasing = globalIsIncreasing;
    if (probeVal > currentVal) {
      isIncreasing = true;
    } else if (probeVal < currentVal) {
      isIncreasing = false;
    } else {
      // Forward probe landed on a quantized plateau; test backward probe
      const probeNegInputs = { ...mergedInputs, [variableToSolve]: Math.max(0, mid - delta) };
      const probeNegVal = formula.compute(probeNegInputs)[targetOutputId] ?? 0;
      if (currentVal > probeNegVal) {
        isIncreasing = true;
      } else if (currentVal < probeNegVal) {
        isIncreasing = false;
      } else if (globalIsDecreasing) {
        isIncreasing = false;
      } else if (globalIsIncreasing) {
        isIncreasing = true;
      }
    }

    if (isIncreasing) {
      if (diff > 0) high = mid;
      else low = mid;
    } else {
      if (diff > 0) low = mid;
      else high = mid;
    }
  }

  return { solvedValue: roundTo((low + high) / 2, 2) };
}

export interface InvoiceLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface InvoiceTotalsResult {
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  lineItems: Array<InvoiceLineItem & { lineTotal: number }>;
}

/**
 * Computes deterministic invoice subtotal, tax amount, and grand total.
 */
export function computeInvoiceTotals(
  items: InvoiceLineItem[],
  taxPct: number = 0
): InvoiceTotalsResult {
  const safeTax = Math.max(0, taxPct || 0);
  const lineItems = items.map((item) => {
    const qty = Math.max(0, item.qty || 0);
    const unitPrice = Math.max(0, item.unitPrice || 0);
    const lineTotal = roundTo(qty * unitPrice, 2);
    return {
      description: item.description || 'Service Item',
      qty,
      unitPrice,
      lineTotal,
    };
  });
  const subtotal = roundTo(
    lineItems.reduce((acc, it) => acc + it.lineTotal, 0),
    2
  );
  const taxAmount = roundTo(subtotal * (safeTax / 100), 2);
  const grandTotal = roundTo(subtotal + taxAmount, 2);
  return {
    subtotal,
    taxAmount,
    grandTotal,
    lineItems,
  };
}

/**
 * Generates a standalone PDF 1.4 invoice byte buffer client-side.
 */
export function generateInvoicePdfBytes(invoice: {
  invoiceNumber: string;
  businessName: string;
  clientName: string;
  currencySymbol?: string;
  items: InvoiceLineItem[];
  taxPct: number;
}): Uint8Array {
  const totals = computeInvoiceTotals(invoice.items, invoice.taxPct);
  const sym = invoice.currencySymbol || '$';
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const streamLines = [
    'BT',
    '/F1 18 Tf',
    '54 730 Td',
    `(${esc(`INVOICE #${invoice.invoiceNumber || 'INV-1001'}`)}) Tj`,
    '/F1 12 Tf',
    '0 -26 Td',
    `(${esc(`From: ${invoice.businessName || 'Studio Desk LLC'}`)}) Tj`,
    '0 -18 Td',
    `(${esc(`Bill To: ${invoice.clientName || 'Client Corp'}`)}) Tj`,
    '0 -28 Td',
    '(------------------------------------------------------------) Tj',
  ];

  for (const it of totals.lineItems) {
    streamLines.push('0 -20 Td');
    streamLines.push(
      `(${esc(`${it.description}  (${it.qty} x ${sym}${it.unitPrice.toFixed(2)})  =  ${sym}${it.lineTotal.toFixed(2)}`)}) Tj`
    );
  }

  streamLines.push('0 -26 Td');
  streamLines.push('(------------------------------------------------------------) Tj');
  streamLines.push('0 -20 Td');
  streamLines.push(`(${esc(`Subtotal: ${sym}${totals.subtotal.toFixed(2)}`)}) Tj`);
  streamLines.push('0 -18 Td');
  streamLines.push(`(${esc(`Tax (${invoice.taxPct}%): ${sym}${totals.taxAmount.toFixed(2)}`)}) Tj`);
  streamLines.push('/F1 14 Tf');
  streamLines.push('0 -24 Td');
  streamLines.push(`(${esc(`Grand Total Due: ${sym}${totals.grandTotal.toFixed(2)}`)}) Tj`);
  streamLines.push('ET');

  const streamBody = streamLines.join('\n');
  const objects = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    {
      id: 3,
      body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    },
    { id: 4, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
    { id: 5, body: `<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream` },
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const o of objects) {
    offsets.push(pdf.length);
    pdf += `${o.id} 0 obj\n${o.body}\nendobj\n`;
  }
  const startxref = pdf.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  const out = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    out[i] = pdf.charCodeAt(i) & 0xff;
  }
  return out;
}

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', (e: MessageEvent) => {
    const { action, id, data } = e.data || {};
    try {
      if (action === 'evaluate') {
        const { formulaId, inputs } = data;
        const formula = CALCULATOR_FORMULAS[formulaId] || SAAS_RUNWAY_FORMULA;
        const result = evaluateFormula(formula, inputs || {});
        (self as any).postMessage({ id, result });
      } else if (action === 'solve') {
        const { formulaId, targetOutputId, targetValue, inputOverrides, variableToSolve } = data;
        const result = solveBidirectional(formulaId, targetOutputId, targetValue, inputOverrides, variableToSolve);
        (self as any).postMessage({ id, result });
      } else if (action === 'listFormulas') {
        const list = Object.values(CALCULATOR_FORMULAS).map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          inputs: f.inputs,
          outputs: f.outputs,
        }));
        (self as any).postMessage({ id, result: list });
      }
    } catch (err: any) {
      (self as any).postMessage({ id, error: err?.message || String(err) });
    }
  });
}
