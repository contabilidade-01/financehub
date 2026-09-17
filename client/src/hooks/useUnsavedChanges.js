"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useUnsavedChanges = useUnsavedChanges;
const react_1 = require("react");
function useUnsavedChanges({ forms, onTabChange, onSaveCallback }) {
    const [hasUnsavedChanges, setHasUnsavedChanges] = (0, react_1.useState)(false);
    const [pendingTab, setPendingTab] = (0, react_1.useState)(null);
    const [showModal, setShowModal] = (0, react_1.useState)(false);
    const initialValues = (0, react_1.useRef)({});
    // Salvar valores iniciais dos formulários
    (0, react_1.useEffect)(() => {
        forms.forEach((form, index) => {
            const formValues = form.getValues();
            initialValues.current[index] = JSON.stringify(formValues);
        });
    }, []);
    // Monitorar mudanças nos formulários usando formState.isDirty
    (0, react_1.useEffect)(() => {
        const checkForChanges = () => {
            const anyFormChanged = forms.some(form => form.formState.isDirty);
            setHasUnsavedChanges(anyFormChanged);
        };
        // Verificar inicialmente
        checkForChanges();
        // Configurar interval para verificar mudanças
        const interval = setInterval(checkForChanges, 500);
        return () => {
            clearInterval(interval);
        };
    }, [forms]);
    // Função para lidar com mudança de aba
    const handleTabChange = (newTab) => {
        if (hasUnsavedChanges) {
            setPendingTab(newTab);
            setShowModal(true);
        }
        else {
            onTabChange === null || onTabChange === void 0 ? void 0 : onTabChange(newTab, false);
        }
    };
    // Salvar alterações
    const saveChanges = async () => {
        try {
            if (onSaveCallback) {
                await onSaveCallback();
            }
            // Atualizar valores iniciais após salvar e resetar estado dirty
            forms.forEach((form, index) => {
                const currentValues = form.getValues();
                initialValues.current[index] = JSON.stringify(currentValues);
                form.reset(currentValues, { keepDefaultValues: true });
            });
            setHasUnsavedChanges(false);
            setShowModal(false);
            if (pendingTab) {
                onTabChange === null || onTabChange === void 0 ? void 0 : onTabChange(pendingTab, false);
                setPendingTab(null);
            }
        }
        catch (error) {
            console.error('Erro ao salvar:', error);
            // Manter a modal aberta em caso de erro
        }
    };
    // Descartar alterações
    const discardChanges = () => {
        forms.forEach((form, index) => {
            const originalValues = JSON.parse(initialValues.current[index]);
            form.reset(originalValues, { keepDefaultValues: true });
        });
        setHasUnsavedChanges(false);
        setShowModal(false);
        if (pendingTab) {
            onTabChange === null || onTabChange === void 0 ? void 0 : onTabChange(pendingTab, false);
            setPendingTab(null);
        }
    };
    // Cancelar mudança de aba
    const cancelTabChange = () => {
        setShowModal(false);
        setPendingTab(null);
    };
    return {
        hasUnsavedChanges,
        showModal,
        handleTabChange,
        saveChanges,
        discardChanges,
        cancelTabChange,
    };
}
