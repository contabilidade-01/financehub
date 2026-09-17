"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryClient = exports.getQueryFn = void 0;
exports.apiRequest = apiRequest;
const react_query_1 = require("@tanstack/react-query");
async function throwIfResNotOk(res) {
    if (!res.ok) {
        try {
            // Tenta analisar como JSON primeiro
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const jsonData = await res.clone().json();
                console.error(`API Error (${res.status}):`, jsonData);
                throw jsonData;
            }
            else {
                const text = await res.text();
                console.error(`API Error (${res.status}):`, text || res.statusText);
                throw new Error(`${res.status}: ${text || res.statusText}`);
            }
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                // Se não conseguir analisar como JSON, usa o texto
                const text = await res.text();
                console.error(`API Error (${res.status}):`, text || res.statusText);
                throw new Error(`${res.status}: ${text || res.statusText}`);
            }
            throw error;
        }
    }
}
async function apiRequest(url, options = { method: 'GET' }) {
    console.log(`API Request: ${options.method} ${url}`, options.data);
    const res = await fetch(url, {
        method: options.method,
        headers: options.data ? { "Content-Type": "application/json" } : {},
        body: options.data ? JSON.stringify(options.data) : undefined,
        credentials: "include",
    });
    await throwIfResNotOk(res);
    if (options.method === "DELETE") {
        return true;
    }
    const responseData = await res.json().catch(() => ({}));
    console.log(`API Response:`, responseData);
    return responseData;
}
const getQueryFn = ({ on401: unauthorizedBehavior }) => async ({ queryKey }) => {
    const res = await fetch(queryKey[0], {
        credentials: "include",
    });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
    }
    await throwIfResNotOk(res);
    return await res.json();
};
exports.getQueryFn = getQueryFn;
exports.queryClient = new react_query_1.QueryClient({
    defaultOptions: {
        queries: {
            queryFn: (0, exports.getQueryFn)({ on401: "throw" }),
            refetchInterval: false,
            refetchOnWindowFocus: false,
            staleTime: Infinity,
            retry: false,
        },
        mutations: {
            retry: false,
        },
    },
});
