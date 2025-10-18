// Translation utilities for the application

export const translatePaymentMethodName = (name: string, t: any): string => {
  return t(`payment_methods.names.${name}`, name);
};

export const translateCategoryType = (type: string, t: any): string => {
  if (type === 'Receita') {
    return t('common.income', 'Income');
  } else if (type === 'Despesa') {
    return t('common.expenses', 'Expenses');
  }
  return type;
};

export const translateCategoryName = (name: string, t: any): string => {
  return t(`categories.names.${name}`, name);
};

export const getMonthNames = (t: any): string[] => {
  return [
    t('calendar.months.january', 'January'),
    t('calendar.months.february', 'February'),
    t('calendar.months.march', 'March'),
    t('calendar.months.april', 'April'),
    t('calendar.months.may', 'May'),
    t('calendar.months.june', 'June'),
    t('calendar.months.july', 'July'),
    t('calendar.months.august', 'August'),
    t('calendar.months.september', 'September'),
    t('calendar.months.october', 'October'),
    t('calendar.months.november', 'November'),
    t('calendar.months.december', 'December')
  ];
};

export const getDayNames = (t: any): string[] => {
  return [
    t('calendar.days.sun', 'Sun'),
    t('calendar.days.mon', 'Mon'),
    t('calendar.days.tue', 'Tue'),
    t('calendar.days.wed', 'Wed'),
    t('calendar.days.thu', 'Thu'),
    t('calendar.days.fri', 'Fri'),
    t('calendar.days.sat', 'Sat')
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