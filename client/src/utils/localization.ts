// Translation utilities for the application

export const translatePaymentMethodName = (name: string, t: any): string => {
  return t(`payment_methods.names.${name}`, name);
};

export const translateCategoryType = (type: string, t: any): string => {
  if (type === 'Receita') {
    return t('common.income', 'Receita');
  } else if (type === 'Despesa') {
    return t('common.expenses', 'Despesa');
  }
  return type;
};

export const translateCategoryName = (name: string, t: any): string => {
  return t(`categories.names.${name}`, name);
};

export const getMonthNames = (t: any): string[] => {
  return [
    t('calendar.months.january', 'Janeiro'),
    t('calendar.months.february', 'Fevereiro'),
    t('calendar.months.march', 'Março'),
    t('calendar.months.april', 'Abril'),
    t('calendar.months.may', 'Maio'),
    t('calendar.months.june', 'Junho'),
    t('calendar.months.july', 'Julho'),
    t('calendar.months.august', 'Agosto'),
    t('calendar.months.september', 'Setembro'),
    t('calendar.months.october', 'Outubro'),
    t('calendar.months.november', 'Novembro'),
    t('calendar.months.december', 'Dezembro')
  ];
};

export const getDayNames = (t: any): string[] => {
  return [
    t('calendar.days.sun', 'Dom'),
    t('calendar.days.mon', 'Seg'),
    t('calendar.days.tue', 'Ter'),
    t('calendar.days.wed', 'Qua'),
    t('calendar.days.thu', 'Qui'),
    t('calendar.days.fri', 'Sex'),
    t('calendar.days.sat', 'Sáb')
  ];
};

export const getDayNamesLong = (t: any): string[] => {
  return [
    t('calendar.days.sunday', 'Sunday'),
    t('calendar.days.monday', 'Monday'),
    t('calendar.days.tuesday', 'Tuesday'),
    t('calendar.days.wednesday', 'Wednesday'),
    t('calendar.days.thursday', 'Thursday'),
    t('calendar.days.friday', 'Friday'),
    t('calendar.days.saturday', 'Saturday')
  ];
};