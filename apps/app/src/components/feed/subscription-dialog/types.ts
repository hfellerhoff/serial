export type SwitchPreview = {
  currentPlanId: string;
  currentPlanName: string;
  currentAmount: number;
  newPlanId: string;
  newPlanName: string;
  newAmount: number;
  proratedAmount: number;
  isDowngrade: boolean;
  periodEnd: string;
  currency: string;
  billingInterval: "month" | "year";
  subscriptionId: string;
  newProductId: string;
};
