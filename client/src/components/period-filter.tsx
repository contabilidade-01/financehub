import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerResponsive } from "@/components/ui/date-picker-responsive";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { addMonths, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";

export type PeriodOption = "this_month" | "this_quarter" | "this_year" | "custom";

interface PeriodFilterProps {
  onPeriodChange: (start: Date, end: Date) => void;
  className?: string;
}

export function PeriodFilter({ onPeriodChange, className }: PeriodFilterProps) {
  const [option, setOption] = useState<PeriodOption>("this_month");
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const updateDates = (opt: PeriodOption) => {
    setOption(opt);
    const now = new Date();
    let start = startOfMonth(now);
    let end = endOfMonth(now);

    if (opt === "this_quarter") {
      start = startOfQuarter(now);
      end = endOfQuarter(now);
    } else if (opt === "this_year") {
      start = startOfYear(now);
      end = endOfYear(now);
    } else if (opt === "custom") {
      // Mantém datas atuais para ajuste manual
    }

    setStartDate(start);
    setEndDate(end);
    onPeriodChange(start, end);
  };

  const handleCustomChange = (s: Date | undefined, e: Date | undefined) => {
    if (s) setStartDate(s);
    if (e) setEndDate(e);
    onPeriodChange(startDate, endDate); // Nota: aqui pode haver lag de estado, idealmente passamos os novos valores
  };

  // Ajuste para garantir que o onPeriodChange receba os valores mais recentes no custom
  const applyCustom = () => {
    onPeriodChange(startDate, endDate);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-3 p-2 bg-muted/30 rounded-lg border", className)}>
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Select value={option} onValueChange={(v: PeriodOption) => updateDates(v)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">Este Mês</SelectItem>
            <SelectItem value="this_quarter">Este Trimestre</SelectItem>
            <SelectItem value="this_year">Este Ano</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {option === "custom" && (
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Início:</span>
            <DatePickerResponsive
              date={startDate}
              onDateChange={(d) => { setStartDate(d || new Date()); }}
              className="w-[130px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Fim:</span>
            <DatePickerResponsive
              date={endDate}
              onDateChange={(d) => { setEndDate(d || new Date()); }}
              className="w-[130px]"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={applyCustom} className="h-9">
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}
