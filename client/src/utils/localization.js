"use strict";
// Translation utilities for the application
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDayNamesLong = exports.getDayNames = exports.getMonthNames = exports.translateCategoryName = exports.translateCategoryType = exports.translatePaymentMethodName = void 0;
const translatePaymentMethodName = (name, t) => {
    return t(`payment_methods.names.${name}`, name);
};
exports.translatePaymentMethodName = translatePaymentMethodName;
const translateCategoryType = (type, t) => {
    if (type === 'Receita') {
        return t('common.income', 'Income');
    }
    else if (type === 'Despesa') {
        return t('common.expenses', 'Expenses');
    }
    return type;
};
exports.translateCategoryType = translateCategoryType;
const translateCategoryName = (name, t) => {
    return t(`categories.names.${name}`, name);
};
exports.translateCategoryName = translateCategoryName;
const getMonthNames = (t) => {
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
exports.getMonthNames = getMonthNames;
const getDayNames = (t) => {
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
exports.getDayNames = getDayNames;
const getDayNamesLong = (t) => {
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
exports.getDayNamesLong = getDayNamesLong;
