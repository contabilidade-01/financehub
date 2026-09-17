"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useShake = useShake;
const react_1 = require("react");
function useShake(duration = 400) {
    const [isShaking, setIsShaking] = (0, react_1.useState)(false);
    const triggerShake = (0, react_1.useCallback)(() => {
        if (isShaking)
            return; // Evitar múltiplos shakes simultâneos
        setIsShaking(true);
        setTimeout(() => {
            setIsShaking(false);
        }, duration);
    }, [isShaking, duration]);
    return {
        isShaking,
        triggerShake
    };
}
