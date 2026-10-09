export type Tipo = "fisica" | "juridica";

export interface Plan {
  id: number;
  name: string;
  description?: string | null;
  priceMonthly: string | number;
  tipoPessoa?: string | null;
  features?: string | null;
}
