"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuth = useAuth;
const react_1 = require("react");
const react_query_1 = require("@tanstack/react-query");
function useAuth() {
    const [authState, setAuthState] = (0, react_1.useState)({
        isAuthenticated: false,
        isLoading: true,
    });
    const queryClient = (0, react_query_1.useQueryClient)();
    const { data: user, isLoading: isUserLoading } = (0, react_query_1.useQuery)({
        queryKey: ['/api/auth/me'],
        enabled: authState.isAuthenticated,
        staleTime: 1000 * 60 * 30, // 30 minutes
        retry: false,
    });
    // Check authentication status on mount
    (0, react_1.useEffect)(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch('/api/auth/me', {
                    credentials: 'include',
                });
                setAuthState({
                    isAuthenticated: res.ok,
                    isLoading: false,
                });
            }
            catch (error) {
                setAuthState({
                    isAuthenticated: false,
                    isLoading: false,
                });
            }
        };
        checkAuth();
    }, []);
    // Logout function
    const logout = (0, react_1.useCallback)(async () => {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
            });
            setAuthState({
                isAuthenticated: false,
                isLoading: false,
            });
            queryClient.clear();
        }
        catch (error) {
            console.error('Logout failed:', error);
        }
    }, [queryClient]);
    return {
        user,
        isAuthenticated: authState.isAuthenticated,
        isLoading: authState.isLoading || isUserLoading,
        logout
    };
}
