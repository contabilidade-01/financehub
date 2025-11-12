import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, AlertCircle } from 'lucide-react';

interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

interface CreditCardFormProps {
  onCardChange: (card: CreditCardData) => void;
  onValidChange: (isValid: boolean) => void;
}

export function CreditCardForm({ onCardChange, onValidChange }: CreditCardFormProps) {
  const [card, setCard] = useState<CreditCardData>({
    holderName: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CreditCardData, string>>>({});
  const [isSandboxMode, setIsSandboxMode] = useState(false);

  // Buscar ambiente do Asaas
  useEffect(() => {
    fetch('/api/billing/environment')
      .then(res => res.json())
      .then(data => {
        setIsSandboxMode(data.isSandbox);
        console.log('[CreditCardForm] Asaas environment:', data.environment);
      })
      .catch(err => {
        console.error('[CreditCardForm] Error fetching environment:', err);
        // Em caso de erro, assumir sandbox como mais seguro
        setIsSandboxMode(true);
      });
  }, []);

  // Cartões de teste válidos (Asaas sandbox)
  const TEST_CARDS = [
    '5162306027176633', // Mastercard teste
    '4111111111111111', // Visa teste
    '4000000000000010', // Visa teste 2
  ];

  // Validação Luhn Algorithm (ou aceitar cartões de teste em sandbox)
  const validateCardNumber = (number: string): boolean => {
    const cleaned = number.replace(/\s/g, '');

    // Em modo sandbox, aceitar cartões de teste
    if (isSandboxMode && TEST_CARDS.includes(cleaned)) {
      return true;
    }

    if (!/^\d{13,19}$/.test(cleaned)) return false;

    let sum = 0;
    let isEven = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  };

  // Detectar bandeira
  const detectCardBrand = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    if (/^4/.test(cleaned)) return 'Visa';
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
    if (/^3[47]/.test(cleaned)) return 'Amex';
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover';
    return '';
  };

  // Formatar número do cartão
  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\s/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  };

  const handleChange = (field: keyof CreditCardData, value: string) => {
    let formattedValue = value;

    if (field === 'number') {
      formattedValue = formatCardNumber(value.replace(/\D/g, '').slice(0, 16));
    } else if (field === 'expiryMonth') {
      formattedValue = value.replace(/\D/g, '').slice(0, 2);
    } else if (field === 'expiryYear') {
      formattedValue = value.replace(/\D/g, '').slice(0, 4);
    } else if (field === 'ccv') {
      formattedValue = value.replace(/\D/g, '').slice(0, 4);
    }

    const newCard = { ...card, [field]: formattedValue };
    setCard(newCard);
    onCardChange(newCard);

    // Validar
    validateField(field, formattedValue);
  };

  const validateField = (field: keyof CreditCardData, value: string) => {
    const newErrors = { ...errors };

    switch (field) {
      case 'holderName':
        if (!value || value.length < 3) {
          newErrors.holderName = 'Nome inválido';
        } else {
          delete newErrors.holderName;
        }
        break;

      case 'number':
        if (!validateCardNumber(value)) {
          newErrors.number = 'Número de cartão inválido';
        } else {
          delete newErrors.number;
        }
        break;

      case 'expiryMonth':
        const month = parseInt(value);
        if (!month || month < 1 || month > 12) {
          newErrors.expiryMonth = 'Mês inválido';
        } else {
          delete newErrors.expiryMonth;
        }
        break;

      case 'expiryYear':
        const year = parseInt(value);
        const currentYear = new Date().getFullYear();
        if (!year || year < currentYear) {
          newErrors.expiryYear = 'Ano inválido';
        } else {
          delete newErrors.expiryYear;
        }
        break;

      case 'ccv':
        if (!value || value.length < 3) {
          newErrors.ccv = 'CVV inválido';
        } else {
          delete newErrors.ccv;
        }
        break;
    }

    setErrors(newErrors);

    // Verificar se todos os campos são válidos
    const isValid = Object.keys(newErrors).length === 0 &&
                    card.holderName.length >= 3 &&
                    validateCardNumber(card.number) &&
                    card.expiryMonth.length === 2 &&
                    card.expiryYear.length === 4 &&
                    card.ccv.length >= 3;

    onValidChange(isValid);
  };

  const cardBrand = detectCardBrand(card.number);

  return (
    <div className="space-y-4">
      {isSandboxMode && (
        <Alert className="bg-yellow-500/10 border-yellow-500/30">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            <p className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">🧪 Modo de Teste (Sandbox Asaas)</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
              <strong>Cartão de teste:</strong> <code className="bg-yellow-500/20 px-2 py-0.5 rounded font-mono">5162 3060 2717 6633</code>
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Use qualquer data futura e CVV 123. Nenhum pagamento real será processado.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 text-white">
        <div className="flex justify-between items-start mb-8">
          <CreditCard className="h-8 w-8" />
          <span className="text-sm font-semibold">{cardBrand}</span>
        </div>
        <div className="font-mono text-xl tracking-wider mb-6">
          {card.number || '•••• •••• •••• ••••'}
        </div>
        <div className="flex justify-between items-end">
          <div>
            <div className="text-xs text-gray-400 mb-1">Nome no cartão</div>
            <div className="font-semibold">{card.holderName || 'NOME COMPLETO'}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1">Validade</div>
            <div className="font-semibold">
              {card.expiryMonth || 'MM'}/{card.expiryYear ? card.expiryYear.slice(2) : 'AA'}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="cardNumber">Número do Cartão</Label>
          <Input
            id="cardNumber"
            placeholder="0000 0000 0000 0000"
            value={card.number}
            onChange={(e) => handleChange('number', e.target.value)}
            className={errors.number ? 'border-red-500' : ''}
            autoComplete="off"
            inputMode="numeric"
          />
          {errors.number && <p className="text-sm text-red-500 mt-1">{errors.number}</p>}
        </div>

        <div>
          <Label htmlFor="holderName">Nome no Cartão</Label>
          <Input
            id="holderName"
            placeholder="NOME COMPLETO"
            value={card.holderName}
            onChange={(e) => handleChange('holderName', e.target.value.toUpperCase())}
            className={errors.holderName ? 'border-red-500' : ''}
            autoComplete="off"
          />
          {errors.holderName && <p className="text-sm text-red-500 mt-1">{errors.holderName}</p>}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="expiryMonth">Mês</Label>
            <Input
              id="expiryMonth"
              placeholder="MM"
              value={card.expiryMonth}
              onChange={(e) => handleChange('expiryMonth', e.target.value)}
              className={errors.expiryMonth ? 'border-red-500' : ''}
              autoComplete="off"
              inputMode="numeric"
            />
          </div>

          <div>
            <Label htmlFor="expiryYear">Ano</Label>
            <Input
              id="expiryYear"
              placeholder="AAAA"
              value={card.expiryYear}
              onChange={(e) => handleChange('expiryYear', e.target.value)}
              className={errors.expiryYear ? 'border-red-500' : ''}
              autoComplete="off"
              inputMode="numeric"
            />
          </div>

          <div>
            <Label htmlFor="ccv">CVV</Label>
            <Input
              id="ccv"
              placeholder="123"
              type="text"
              value={card.ccv}
              onChange={(e) => handleChange('ccv', e.target.value)}
              className={errors.ccv ? 'border-red-500' : ''}
              autoComplete="off"
              inputMode="numeric"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
