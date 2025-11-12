import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface PlanCardProps {
  id: number;
  name: string;
  description?: string;
  priceMonthly: string;
  features: string;
  isSelected?: boolean;
  onSelect: () => void;
}

export function PlanCard({ name, description, priceMonthly, features, isSelected, onSelect }: PlanCardProps) {
  const featureList = JSON.parse(features || '[]');

  return (
    <Card className={`relative ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <span className="text-4xl font-bold">R$ {parseFloat(priceMonthly).toFixed(2)}</span>
          <span className="text-muted-foreground">/mês</span>
        </div>
        <ul className="space-y-2">
          {featureList.map((feature: string, index: number) => (
            <li key={index} className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          onClick={onSelect}
          className="w-full"
          variant={isSelected ? 'default' : 'outline'}
        >
          {isSelected ? 'Selecionado' : 'Selecionar'}
        </Button>
      </CardFooter>
    </Card>
  );
}
